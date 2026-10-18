/**
 * Records a page's viewport through the Chrome DevTools Protocol screencast and
 * encodes it in one ffmpeg pass: crop to an element, trim to a mark, scale to
 * the exact resolution, and encode to the output's extension. No dependencies.
 *
 * Run Chromium headless and launched with launchArgs(density): headless delivers
 * a steady 60 fps at the forced density, while a headed window follows the
 * monitor's density and refresh rate. Chromium only sends a frame when the page
 * repaints; each frame is held until the next one, so timing stays exact.
 *
 *   const browser = await chromium.launch({ args: launchArgs(1.35) });
 *   const context = await browser.newContext({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1.35 });
 *   const page = await context.newPage();
 *   // ...open the stage, set it up
 *   const recorder = new ScreencastRecorder({ dir: '<scratchpad>/rec-opening' });
 *   await recorder.start(await context.newCDPSession(page));
 *   const from = recorder.mark();
 *   // ...the scene's actions
 *   await recorder.stop();
 *   await recorder.encode({ output: 'artifacts/captures/x/opening.mp4', from, crop: await page.locator('.stage-frame').boundingBox(), size: { width: 1080, height: 1080 } });
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const launchArgs = (density) => [`--force-device-scale-factor=${density}`];

const nowSeconds = () => Number(process.hrtime.bigint()) / 1e9;

// One encoding per extension, as in script-format.md. Colors are tagged BT.709
// so players don't guess; the screencast frames are sRGB.
const BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const FORMATS = {
  '.mp4': { yuv: true, args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', ...BT709, '-movflags', '+faststart'] },
  '.webm': { yuv: true, args: ['-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p', ...BT709] },
  '.mov': { yuv: false, args: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', ...BT709] },
  '.gif': { yuv: false, maxFps: 30, args: [] },
};

export class ScreencastRecorder {
  /**
   * `dir` holds the raw frames. It must not exist yet or be empty: the recorder
   * never deletes anything, so point it at a scratch directory, not at the captures.
   * `format` is the frame format: png is lossless, jpeg is smaller.
   */
  constructor({ dir, format = 'png', quality = 90 }) {
    if (!dir) throw new Error('dir is required');
    if (!['png', 'jpeg'].includes(format)) throw new Error('format must be png or jpeg');
    this.dir = path.resolve(dir);
    this.framesDir = path.join(this.dir, 'frames');
    this.format = format;
    this.quality = quality;
    this.state = 'idle';
  }

  async start(session) {
    if (this.state !== 'idle') throw new Error('A recorder records once: create a new one');
    const existing = await readdir(this.dir).catch(() => []);
    if (existing.length) throw new Error(`${this.dir} is not empty: use a new directory`);
    await mkdir(this.framesDir, { recursive: true });
    this.session = session;
    this.frames = [];
    this.offset = Infinity;
    this.ackErrors = 0;
    this.writes = Promise.resolve();
    this.log = createWriteStream(path.join(this.dir, 'frames.jsonl'));
    this.onFrame = ({ data, metadata, sessionId }) => {
      const arrived = nowSeconds();
      session.send('Page.screencastFrameAck', { sessionId }).catch(() => { this.ackErrors++; });
      if (this.state !== 'recording') return;
      // metadata.timestamp is when the browser produced the frame. Node's clock
      // only sees it after transport, so the smallest gap is the best clock offset.
      const time = metadata.timestamp;
      this.offset = Math.min(this.offset, arrived - time);
      const buffer = Buffer.from(data, 'base64');
      const size = imageSize(buffer);
      const frame = {
        index: this.frames.length + 1,
        file: `frames/${String(this.frames.length + 1).padStart(7, '0')}.${this.format === 'png' ? 'png' : 'jpg'}`,
        time,
        width: size?.width ?? null,
        height: size?.height ?? null,
        cssWidth: metadata.deviceWidth,
        cssHeight: metadata.deviceHeight,
        bytes: buffer.length,
      };
      this.frames.push(frame);
      this.writes = this.writes.then(async () => {
        await writeFile(path.join(this.dir, frame.file), buffer);
        this.log.write(JSON.stringify(frame) + '\n');
      });
      this.firstFrame?.resolve();
    };
    let resolveFirst;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    this.firstFrame = { resolve: resolveFirst };
    session.on('Page.screencastFrame', this.onFrame);
    const options = { format: this.format, everyNthFrame: 1 };
    if (this.format === 'jpeg') options.quality = this.quality;
    this.state = 'recording';
    this.startedAt = nowSeconds();
    try {
      await session.send('Page.startScreencast', options);
    } catch (error) {
      session.off('Page.screencastFrame', this.onFrame);
      this.state = 'done';
      throw error;
    }
    // Chromium sends the current picture as soon as the screencast starts. Waiting
    // for it means every later action is on camera and the clock offset is known.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('No frame within 5s: is the page visible?')), 5000));
    await Promise.race([first, timeout]);
  }

  /** The current moment, to pass as `from` to encode() so the video starts there. */
  mark() {
    if (this.state !== 'recording') throw new Error('mark() needs a running recording');
    return nowSeconds() - this.offset;
  }

  async stop() {
    if (this.state !== 'recording') throw new Error('Recorder is not running');
    this.end = nowSeconds() - this.offset;
    this.state = 'done';
    try {
      await this.session.send('Page.stopScreencast');
    } finally {
      this.session.off('Page.screencastFrame', this.onFrame);
      await this.writes;
      await new Promise((resolve, reject) => this.log.end((error) => error ? reject(error) : resolve()));
    }
    // Frames that arrive after the stop moment are already dropped by state; any
    // stamped later than `end` (transport lag) would extend the video, so cut them.
    this.frames = this.frames.filter((frame) => frame.time <= this.end);
    if (!this.frames.length) throw new Error('No frames were recorded');
    const intervals = this.frames.slice(1).map((frame, i) => (frame.time - this.frames[i].time) * 1000).sort((a, b) => a - b);
    const pick = (p) => intervals.length ? Number(intervals[Math.min(intervals.length - 1, Math.floor((intervals.length - 1) * p))].toFixed(2)) : null;
    const last = this.frames.at(-1);
    this.report = {
      frames: this.frames.length,
      seconds: Number((this.end - this.frames[0].time).toFixed(3)),
      // Between frames while the page repaints; an idle page sends none, so no fps here.
      p50IntervalMs: pick(0.5),
      p95IntervalMs: pick(0.95),
      framePx: { width: last.width, height: last.height },
      viewportCss: { width: last.cssWidth, height: last.cssHeight },
      density: Number((last.width / last.cssWidth).toFixed(4)),
      ackErrors: this.ackErrors,
    };
    await writeFile(path.join(this.dir, 'report.json'), JSON.stringify(this.report, null, 2) + '\n');
    return this.report;
  }

  /**
   * Encodes the recording to `output`, whose extension picks the encoding.
   * - `from`: a mark(); the video starts there, showing the picture at that moment.
   * - `crop`: a box in CSS px, such as a locator's boundingBox().
   * - `size`: the exact output px. Never larger than the cropped pixels.
   * - `ffmpeg`: the binary's path (default `ffmpeg` on the PATH).
   * Refuses to overwrite `output`.
   */
  async encode({ output, from, crop, size, fps = 60, ffmpeg = 'ffmpeg' }) {
    if (this.state !== 'done' || !this.report) throw new Error('Call stop() before encode()');
    const ext = path.extname(output).toLowerCase();
    const format = FORMATS[ext];
    if (!format) throw new Error(`No encoding for ${ext}: use ${Object.keys(FORMATS).join(', ')}`);
    if (await readdir(path.dirname(path.resolve(output))).then((names) => names.includes(path.basename(output)), () => false)) {
      throw new Error(`${output} exists: pick another name`);
    }

    const start = from ?? this.frames[0].time;
    if (start < this.frames[0].time - 0.05 || start >= this.end) throw new Error('`from` is outside the recording');
    // One output frame per tick, showing the frame on screen at that moment. Done
    // here because ffmpeg's concat demuxer rounds image timestamps to 1/25 s.
    const rate = Math.min(fps, format.maxFps ?? fps);
    const ticks = [];
    for (let k = 0, i = 0; start + k / rate < this.end - 1e-6; k++) {
      while (i + 1 < this.frames.length && this.frames[i + 1].time <= start + k / rate) i++;
      ticks.push(path.join(this.dir, this.frames[i].file));
    }

    // The first frame is sometimes a few px off; bring every frame to the last one's size.
    const { width: frameW, height: frameH } = this.report.framePx;
    const density = this.report.density;
    const box = crop
      ? { x: Math.round(crop.x * density), y: Math.round(crop.y * density), width: Math.round(crop.width * density), height: Math.round(crop.height * density) }
      : { x: 0, y: 0, width: frameW, height: frameH };
    if (box.x < 0 || box.y < 0 || box.x + box.width > frameW + 1 || box.y + box.height > frameH + 1) {
      throw new Error(`Crop ${JSON.stringify(box)} falls outside the ${frameW}×${frameH} frame`);
    }
    box.width = Math.min(box.width, frameW - box.x);
    box.height = Math.min(box.height, frameH - box.y);
    const out = size ?? { width: box.width, height: box.height };
    // A pixel of rounding is resampling, not upscaling.
    if (out.width > box.width + 1 || out.height > box.height + 1) {
      throw new Error(`Would upscale ${box.width}×${box.height} to ${out.width}×${out.height}: record at a higher density`);
    }
    if (ext === '.mp4' && (out.width % 2 || out.height % 2)) throw new Error('.mp4 needs even width and height');

    const inRange = this.format === 'jpeg' ? ':in_range=pc' : '';
    const toYuv = format.yuv ? ':out_color_matrix=bt709:out_range=tv' : '';
    const filters = [
      `scale=${frameW}:${frameH}${inRange}`,
      `crop=${box.width}:${box.height}:${box.x}:${box.y}`,
      `scale=${out.width}:${out.height}:flags=lanczos${toYuv}`,
    ];
    if (ext === '.gif') filters.push('split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a');

    await mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-n',
        '-f', 'image2pipe', '-framerate', String(rate), '-c:v', this.format === 'png' ? 'png' : 'mjpeg', '-i', '-',
        '-vf', filters.join(','), '-an', ...format.args, path.resolve(output),
      ], { stdio: ['pipe', 'inherit', 'inherit'] });
      child.on('error', (error) => reject(error.code === 'ENOENT' ? new Error(`ffmpeg not found at ${ffmpeg}`) : error));
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
      child.stdin.on('error', () => {});
      (async () => {
        for (const file of ticks) {
          if (!child.stdin.write(await readFile(file))) await new Promise((done) => child.stdin.once('drain', done));
        }
        child.stdin.end();
      })().catch(reject);
    });
    return { output: path.resolve(output), width: out.width, height: out.height, seconds: Number((ticks.length / rate).toFixed(3)), fps: rate };
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
