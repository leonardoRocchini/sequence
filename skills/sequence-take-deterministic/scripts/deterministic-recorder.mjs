/**
 * Records a page frame by frame under Chromium's virtual time, then encodes it
 * in one ffmpeg pass: crop to an element, scale to the exact resolution, and
 * encode to the output's extension. No dependencies.
 *
 * Unlike a screencast, nothing runs in real time. Each frame advances the page's
 * clock by exactly 1/fps (CSS animations and transitions, requestAnimationFrame,
 * performance.now, timers), renders it, and screenshots it before the next one
 * starts. A slow machine makes the take slower, never the video: every output
 * frame is a rendered frame, and the same actions give the same frames.
 *
 * Needs chrome-headless-shell (Playwright's default headless Chromium, not
 * channel 'chromium'), launched with launchArgs(density): with begin-frame
 * control the page only paints when the driver sends a frame. Attach the
 * driver right after newPage(), before goto(): until a take starts it sends
 * frames in real time, so the page and Playwright's locators work as usual.
 *
 *   const browser = await chromium.launch({ args: launchArgs(2) });
 *   const context = await browser.newContext({ viewport: { width: 1360, height: 800 }, deviceScaleFactor: 2 });
 *   const page = await context.newPage();
 *   const driver = await FrameDriver.attach(await context.newCDPSession(page));
 *   // ...open the stage, set it up with normal Playwright calls
 *   const take = await driver.record({ dir: '<scratchpad>/rec-opening' });
 *   await take.move(page.mouse, 400, 300);        // one frame per move
 *   await take.act(page.mouse.click(400, 300));
 *   await take.until(() => page.evaluate(() => document.querySelector('.done') !== null));
 *   await take.wait(1000);
 *   await take.stop();
 *   await take.encode({ output: 'artifacts/captures/x/opening.mp4', crop: await page.locator('.stage-frame').boundingBox(), size: { width: 2560, height: 1440 } });
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const launchArgs = (density) => [
  `--force-device-scale-factor=${density}`,
  '--deterministic-mode',
  '--enable-begin-frame-control',
  '--run-all-compositor-stages-before-draw',
  '--disable-threaded-animation',
  '--disable-threaded-scrolling',
  '--disable-checker-imaging',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Page time spent after each render, to run the tasks the frame queued.
const DRAIN_MS = 0.01;

// One encoding per extension, as in script-format.md. Colors are tagged BT.709
// so players don't guess; the frames are sRGB.
const BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const FORMATS = {
  '.mp4': { yuv: true, args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', ...BT709, '-movflags', '+faststart'] },
  '.webm': { yuv: true, args: ['-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p', ...BT709] },
  '.mov': { yuv: false, args: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', ...BT709] },
  '.gif': { yuv: false, maxFps: 30, args: [] },
};

/**
 * Owns a page's frames for its whole life: real-time frames while idle, one
 * frame at a time during a take. One driver per page.
 */
export class FrameDriver {
  static async attach(session, { fps = 60 } = {}) {
    const driver = new FrameDriver(session, fps);
    await session.send('HeadlessExperimental.enable').catch(() => {});
    driver.#live();
    return driver;
  }

  #session;
  #pump = null;
  #running = false;
  #take = null;
  // Virtual time starts with the first take and never stops: Chromium can't turn it off.
  #virtual = null; // { base, elapsed } in ms of renderer uptime

  constructor(session, fps) {
    this.#session = session;
    this.fps = fps;
    this.interval = 1000 / fps;
  }

  /** Frames paced by the wall clock, so the page behaves as in a normal browser. */
  #live() {
    this.#running = true;
    this.#pump = (async () => {
      while (this.#running) {
        const started = performance.now();
        await this.frame().catch(() => {});
        await sleep(Math.max(1, this.interval - (performance.now() - started)));
      }
    })();
  }

  async #pause() {
    this.#running = false;
    await this.#pump;
  }

  async #advance(ms) {
    const expired = new Promise((resolve) => this.#session.once('Emulation.virtualTimeBudgetExpired', resolve));
    await this.#session.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms });
    await expired;
  }

  /**
   * One frame: advance the clock (once virtual), render, optionally screenshot.
   * Virtual time only moves once the page has no immediate work left, so the
   * last sliver of the interval is spent after the render: the tasks the frame
   * queued (animationend handlers, framework re-renders) run before anyone
   * inspects the page, instead of racing the next check in real time.
   */
  async frame(screenshot) {
    const params = { interval: this.interval };
    if (this.#virtual) {
      await this.#advance(this.interval - DRAIN_MS);
      this.#virtual.elapsed += this.interval;
      params.frameTimeTicks = this.#virtual.base + this.#virtual.elapsed - DRAIN_MS;
    }
    if (screenshot) params.screenshot = screenshot;
    const result = await this.#session.send('HeadlessExperimental.beginFrame', params);
    if (this.#virtual) await this.#advance(DRAIN_MS);
    return result;
  }

  /**
   * Stops the real-time frames and starts a take. Frame 0 is the picture at this
   * moment; every later frame is 1/fps of page time after the one before.
   * `dir` must not exist yet or be empty. `format` is png (lossless) or jpeg:
   * speed doesn't change the video here, so png is the default.
   */
  async record({ dir, format = 'png', quality = 90 }) {
    if (this.#take) throw new Error('A take is already running: stop it first');
    if (!dir) throw new Error('dir is required');
    if (!['png', 'jpeg'].includes(format)) throw new Error('format must be png or jpeg');
    const existing = await readdir(dir).catch(() => []);
    if (existing.length) throw new Error(`${path.resolve(dir)} is not empty: use a new directory`);
    await this.#pause();
    if (!this.#virtual) {
      const { virtualTimeTicksBase } = await this.#session.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
      this.#virtual = { base: virtualTimeTicksBase, elapsed: 0 };
    }
    this.#take = new Take(this, { dir: path.resolve(dir), format, quality });
    await this.#take._begin();
    return this.#take;
  }

  /** The viewport's CSS width, to turn CSS px crops into frame px. */
  async _cssWidth() {
    const { result } = await this.#session.send('Runtime.evaluate', { expression: 'window.innerWidth', returnByValue: true });
    return result.value;
  }

  /** Called by Take.stop(): back to real-time frames. */
  _resume() {
    this.#take = null;
    this.#live();
  }

  /** Stops the real-time frames for good, before closing the page. */
  async detach() {
    if (this.#take) throw new Error('Stop the take before detaching');
    await this.#pause();
  }
}

export class Take {
  #driver;
  #last = null;

  constructor(driver, { dir, format, quality }) {
    this.#driver = driver;
    this.dir = dir;
    this.framesDir = path.join(dir, 'frames');
    this.format = format;
    this.screenshot = format === 'jpeg' ? { format, quality } : { format };
    this.fps = driver.fps;
    this.frames = [];
    this.state = 'recording';
  }

  async _begin() {
    await mkdir(this.framesDir, { recursive: true });
    this.cssWidth = await this.#driver._cssWidth();
    // Frame 0 renders the current state without moving the clock.
    await this.#save(await this.#driver.frame(this.screenshot), true);
  }

  async #save(result, first = false) {
    let buffer = result.screenshotData ? Buffer.from(result.screenshotData, 'base64') : this.#last;
    if (!buffer && first) throw new Error('No picture for frame 0: is the page loaded?');
    this.#last = buffer;
    const file = `frames/${String(this.frames.length).padStart(7, '0')}.${this.format === 'png' ? 'png' : 'jpg'}`;
    await writeFile(path.join(this.dir, file), buffer);
    this.frames.push(file);
  }

  /** Page time since frame 0, in ms. */
  get time() {
    return (this.frames.length - 1) * this.#driver.interval;
  }

  async #render(n) {
    for (let i = 0; i < n; i++) {
      if (this.state !== 'recording') throw new Error('The take is stopped');
      await this.#save(await this.#driver.frame(this.screenshot));
    }
  }

  /** Advances `n` frames. */
  async step(n = 1) {
    await this.#render(n);
  }

  /** Advances `ms` of page time, rounded to whole frames. */
  async wait(ms) {
    await this.#render(Math.round(ms / this.#driver.interval));
  }

  /**
   * Moves the pointer and renders exactly one frame. Chromium delivers a mouse
   * move with the next frame, so a pointer path moves one step per frame. Use
   * this, not act(), for moves: act() would guess the frame count from real time.
   */
  async move(mouse, x, y) {
    const moved = mouse.move(x, y);
    await this.#render(1);
    await moved;
  }

  /**
   * Runs any other action (a promise or a function returning one) and advances
   * frames only while it waits for one. Clicks, keys and evaluate() settle
   * without a frame. `settle` is the real time to wait before deciding it needs one.
   */
  async act(action, { settle = 100, maxFrames = 120 } = {}) {
    let done = false;
    const promise = Promise.resolve(typeof action === 'function' ? action() : action).finally(() => { done = true; });
    for (let frames = 0; ; frames++) {
      await Promise.race([promise.catch(() => {}), sleep(settle)]);
      if (done) return promise;
      if (frames === maxFrames) throw new Error(`Action still pending after ${maxFrames} frames`);
      await this.#render(1);
    }
  }

  /** Advances frame by frame until `predicate()` is true, checked before each frame. */
  async until(predicate, { timeout = 10000 } = {}) {
    const limit = this.time + timeout;
    while (!(await predicate())) {
      if (this.time >= limit) throw new Error(`Condition not met within ${timeout} ms of page time`);
      await this.#render(1);
    }
  }

  /** Ends the take; the page gets real-time frames again. */
  async stop() {
    if (this.state !== 'recording') throw new Error('Take is not running');
    this.state = 'done';
    this.#driver._resume();
    const first = await readFile(path.join(this.dir, this.frames[0]));
    this.report = { frames: this.frames.length, seconds: Number((this.frames.length / this.fps).toFixed(3)), fps: this.fps, framePx: imageSize(first), density: Number((imageSize(first).width / this.cssWidth).toFixed(4)) };
    await writeFile(path.join(this.dir, 'report.json'), JSON.stringify(this.report, null, 2) + '\n');
    return this.report;
  }

  #box(crop) {
    const { width: frameW, height: frameH } = this.report.framePx;
    if (!crop) return { x: 0, y: 0, width: frameW, height: frameH };
    // The crop is in CSS px; the frame's px over the viewport's CSS width is the density.
    const density = frameW / this.cssWidth;
    const box = { x: Math.round(crop.x * density), y: Math.round(crop.y * density), width: Math.round(crop.width * density), height: Math.round(crop.height * density) };
    if (box.x < 0 || box.y < 0 || box.x + box.width > frameW + 1 || box.y + box.height > frameH + 1) {
      throw new Error(`Crop ${JSON.stringify(box)} falls outside the ${frameW}×${frameH} frame`);
    }
    box.width = Math.min(box.width, frameW - box.x);
    box.height = Math.min(box.height, frameH - box.y);
    return box;
  }

  #filters(box, out, yuv) {
    const inRange = this.format === 'jpeg' ? ':in_range=pc' : '';
    const toYuv = yuv ? ':out_color_matrix=bt709:out_range=tv' : '';
    return [`scale=${this.report.framePx.width}:${this.report.framePx.height}${inRange}`, `crop=${box.width}:${box.height}:${box.x}:${box.y}`, `scale=${out.width}:${out.height}:flags=lanczos${toYuv}`];
  }

  #size(box, size) {
    const out = size ?? { width: box.width, height: box.height };
    // A pixel of rounding is resampling, not upscaling.
    if (out.width > box.width + 1 || out.height > box.height + 1) {
      throw new Error(`Would upscale ${box.width}×${box.height} to ${out.width}×${out.height}: record at a higher density`);
    }
    return out;
  }

  async #checkOutput(output) {
    if (this.state !== 'done') throw new Error('Call stop() before encoding');
    if (await readdir(path.dirname(path.resolve(output))).then((names) => names.includes(path.basename(output)), () => false)) {
      throw new Error(`${output} exists: pick another name`);
    }
    await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  }

  /**
   * Encodes frames `from`..`to` (ms of page time, default the whole take) to
   * `output`, whose extension picks the encoding.
   * - `crop`: a box in CSS px, such as a locator's boundingBox().
   * - `size`: the exact output px. Never larger than the cropped pixels.
   * - `ffmpeg`: the binary's path (default `ffmpeg` on the PATH).
   * Refuses to overwrite `output`.
   */
  async encode({ output, from = 0, to, crop, size, ffmpeg = 'ffmpeg' }) {
    const ext = path.extname(output).toLowerCase();
    const format = FORMATS[ext];
    if (!format) throw new Error(`No encoding for ${ext}: use ${Object.keys(FORMATS).join(', ')}`);
    await this.#checkOutput(output);
    const box = this.#box(crop);
    const out = this.#size(box, size);
    if (ext === '.mp4' && (out.width % 2 || out.height % 2)) throw new Error('.mp4 needs even width and height');

    const first = Math.round(from / this.#driver.interval);
    const last = to === undefined ? this.frames.length - 1 : Math.round(to / this.#driver.interval);
    if (first < 0 || last >= this.frames.length || first > last) throw new Error('`from`/`to` are outside the take');
    // Every rendered frame is an output frame; a lower rate (gif) takes the nearest ones.
    const rate = Math.min(this.fps, format.maxFps ?? this.fps);
    const files = [];
    for (let k = 0; first + Math.round((k * this.fps) / rate) <= last; k++) files.push(this.frames[first + Math.round((k * this.fps) / rate)]);

    const filters = this.#filters(box, out, format.yuv);
    if (ext === '.gif') filters.push('split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a');
    await this.#ffmpeg(ffmpeg, ['-f', 'image2pipe', '-framerate', String(rate), '-c:v', this.format === 'png' ? 'png' : 'mjpeg', '-i', '-', '-vf', filters.join(','), '-an', ...format.args, path.resolve(output)], files);
    return { output: path.resolve(output), width: out.width, height: out.height, frames: files.length, seconds: Number((files.length / rate).toFixed(3)), fps: rate };
  }

  /** Saves the frame at `at` ms of page time as a PNG, cropped and scaled like encode(). */
  async still({ output, at, crop, size, ffmpeg = 'ffmpeg' }) {
    if (path.extname(output).toLowerCase() !== '.png') throw new Error('still() writes .png');
    await this.#checkOutput(output);
    const index = Math.round(at / this.#driver.interval);
    if (index < 0 || index >= this.frames.length) throw new Error(`${at} ms is outside the take`);
    const box = this.#box(crop);
    const out = this.#size(box, size);
    await this.#ffmpeg(ffmpeg, ['-f', 'image2pipe', '-c:v', this.format === 'png' ? 'png' : 'mjpeg', '-i', '-', '-vf', this.#filters(box, out, false).join(','), '-frames:v', '1', path.resolve(output)], [this.frames[index]]);
    return { output: path.resolve(output), width: out.width, height: out.height, at: index * this.#driver.interval };
  }

  async #ffmpeg(ffmpeg, args, files) {
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
      child.on('error', (error) => reject(error.code === 'ENOENT' ? new Error(`ffmpeg not found at ${ffmpeg}`) : error));
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
      child.stdin.on('error', () => {});
      (async () => {
        for (const file of files) {
          if (!child.stdin.write(await readFile(path.join(this.dir, file)))) await new Promise((done) => child.stdin.once('drain', done));
        }
        child.stdin.end();
      })().catch(reject);
    });
  }
}

/** Pixel size from a PNG's IHDR or a JPEG's SOF marker. */
function imageSize(buffer) {
  if (buffer.readUInt32BE(0) === 0x89504e47) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}
