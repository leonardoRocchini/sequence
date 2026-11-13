/**
 * Records a page frame by frame on a stopped clock, without begin-frame control,
 * so it runs wherever Playwright's Chromium runs, macOS included. Instead of
 * driving the compositor, it stops the page's clocks in JavaScript and seeks its
 * animations:
 *
 * - clockScript, added with context.addInitScript() before the page loads, swaps
 *   performance.now, Date.now, requestAnimationFrame, the timers and
 *   document.timeline for one clock. It follows real time until a take starts,
 *   then moves only when the recorder steps it;
 * - during a take every Web Animation (CSS animations, CSS transitions,
 *   element.animate()) is paused and seeked to that clock each frame, and
 *   finish()ed when it reaches its end, so its events and promises still fire.
 *
 * Each frame: step the clock 1/fps (timers due, then rAF callbacks, then the
 * animations), let the page settle, screenshot the crop. No dependencies.
 *
 *   const context = await browser.newContext({ viewport: { width: 1360, height: 800 }, deviceScaleFactor: 2 });
 *   await context.addInitScript(clockScript);
 *   const page = await context.newPage();
 *   await page.goto(url);
 *   // ...set the stage up with normal Playwright calls
 *   const crop = await page.locator('.stage-frame').boundingBox();
 *   const take = await record(page, { dir: '<scratchpad>/rec-opening', crop });
 *   await take.move(page.mouse, 400, 300);   // one frame per move
 *   await take.act(page.mouse.down());        // input runs on the stopped clock
 *   await take.until(async () => !(await take.busy()));
 *   await take.stop();
 *   await take.encode({ output: 'artifacts/captures/x/opening.mp4', size: { width: 2560, height: 1440 } });
 *
 * join() encodes several stopped takes as one video, with a cut or a crossfade
 * between them.
 *
 * Limits: only the clocks above are virtual. An animation that starts between
 * two frames is timed from the frame that first sees it (up to one frame
 * early); loops restart at the take's first frame; MessageChannel work runs as
 * soon as it can; <video>, canvas or worker clocks keep real time.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

function installVirtualClock() {
  if (window.__vclock) return;
  const native = {
    now: performance.now.bind(performance),
    dateNow: Date.now,
    raf: window.requestAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  };
  const channel = new MessageChannel();
  const hops = [];
  channel.port1.onmessage = () => hops.shift()?.();
  const hop = () => new Promise((resolve) => { hops.push(resolve); channel.port2.postMessage(0); });

  // Every clock value sits on a 1/1024 ms grid, where sums and differences are exact:
  // the page's arithmetic on them (elapsed = now - start, the stage's speed clock) then
  // gives the same result in every take, whatever real time the page loaded at.
  const grid = (ms) => Math.round(ms * 1024) / 1024;
  let virtual = false;
  let realBase = native.now();
  let base = grid(realBase); // clock value at realBase
  let clock = base;
  const dateOffset = native.dateNow() - base;
  const current = () => (virtual ? clock : grid(base + (native.now() - realBase)));

  // Timers and rAF callbacks live here in both modes, so none is left behind on a switch.
  let nextId = 1;
  const timers = new Map(); // id -> { at, fn, args, every }
  let frameCallbacks = new Map();

  performance.now = () => current();
  Date.now = () => Math.round(current() + dateOffset);
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++;
    timers.set(id, { at: grid(current() + Math.max(0, Number(ms) || 0)), fn, args, seq: id });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextId++;
    const every = grid(Math.max(1, Number(ms) || 0));
    timers.set(id, { at: current() + every, fn, args, every, seq: id });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  // The document timeline follows the clock too. Libraries pair it with performance.now
  // (motion sets startTime = performance.now()), so a real timeline running ahead of the
  // clock would make every new animation start out finished.
  const timelineTime = Object.getOwnPropertyDescriptor(AnimationTimeline.prototype, 'currentTime');
  const startTime = Object.getOwnPropertyDescriptor(Animation.prototype, 'startTime');
  const drift = () => (timelineTime.get.call(document.timeline) ?? native.now()) - current();
  Object.defineProperty(AnimationTimeline.prototype, 'currentTime', {
    configurable: true,
    get() { return this === document.timeline ? current() : timelineTime.get.call(this); },
  });
  Object.defineProperty(Animation.prototype, 'startTime', {
    configurable: true,
    get() { const t = startTime.get.call(this); return t == null || this.timeline !== document.timeline ? t : t - drift(); },
    set(v) { startTime.set.call(this, v == null || this.timeline !== document.timeline ? v : v + drift()); },
  });
  window.requestAnimationFrame = (cb) => { const id = nextId++; frameCallbacks.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { frameCallbacks.delete(id); };

  function nextDue(limit) {
    let best = null;
    for (const [id, t] of timers) if (t.at <= limit && (!best || t.at < best[1].at || (t.at === best[1].at && t.seq < best[1].seq))) best = [id, t];
    return best;
  }
  function runTimer([id, t]) {
    if (t.every) { t.at += t.every; t.seq = nextId++; } else timers.delete(id);
    try { typeof t.fn === 'function' ? t.fn(...t.args) : (0, eval)(String(t.fn)); } catch (e) { console.error(e); }
  }
  function runFrame(time) {
    const cbs = frameCallbacks;
    frameCallbacks = new Map();
    for (const cb of cbs.values()) { try { cb(time); } catch (e) { console.error(e); } }
  }

  // Real mode: a native rAF loop drives the same queues with real time.
  (function pump() {
    if (!virtual) {
      const now = current();
      for (let due; (due = nextDue(now)); ) runTimer(due);
      runFrame(now);
    }
    native.raf(pump);
  })();

  // Virtual mode: Web Animations are paused and seeked to the clock.
  const controlled = new Map(); // Animation -> { c0, v0, rate }
  let lastFrame = 0; // real time the last frame was finished
  function endOf(a) {
    const t = a.effect?.getComputedTiming?.();
    return t ? t.endTime : Infinity;
  }
  function syncAnimations(adoptAsIs) {
    for (const a of document.getAnimations()) {
      let c = controlled.get(a);
      if (!c) {
        if (a.playState === 'finished' || a.playState === 'idle') continue;
        const seen = a.currentTime ?? 0;
        // At the take's start, a loop's phase comes from when the page happened to load:
        // restart it, so every take begins alike. Started since the last frame: count it
        // from that frame.
        const c0 = adoptAsIs ? (Number.isFinite(endOf(a)) ? seen : 0) : Math.max(0, seen - (native.now() - lastFrame) * a.playbackRate);
        c = { c0, v0: clock, rate: a.playbackRate, done: false };
        controlled.set(a, c);
        if (a.playState !== 'paused') a.pause();
      }
      if (c.done) continue;
      if (a.playbackRate !== c.rate) { // rebase on a rate change (the stage's speed clock)
        c.c0 += (clock - c.v0) * c.rate; c.v0 = clock; c.rate = a.playbackRate;
      }
      const local = c.c0 + (clock - c.v0) * c.rate;
      const end = endOf(a);
      if (Number.isFinite(end) && local >= end) { c.done = true; a.finish(); continue; }
      if (a.playState !== 'paused') a.pause();
      a.currentTime = local;
    }
  }
  async function settle() {
    for (let i = 0; i < 2; i++) await hop();
  }

  window.__vclock = {
    get virtual() { return virtual; },
    now: current,
    async start() {
      clock = current();
      virtual = true;
      syncAnimations(true);
      await settle();
      lastFrame = native.now();
    },
    async step(ms) {
      // Work queued since the last frame (an input's re-render, its effects) runs at
      // that frame's time, not at whatever the clock reaches first.
      await settle();
      const target = grid(clock + ms);
      for (let due; (due = nextDue(target)); ) {
        clock = Math.max(clock, due[1].at);
        runTimer(due);
        await settle();
      }
      clock = target;
      runFrame(clock);
      await settle();
      for (let i = 0; i < 3; i++) { syncAnimations(false); await settle(); }
      lastFrame = native.now();
    },
    stop() {
      for (const [a, c] of controlled) if (!c.done && a.playState === 'paused') a.play();
      controlled.clear();
      base = clock;
      realBase = native.now();
      virtual = false;
    },
    // A finite animation that hasn't reached its end (paused ones count: they're ours).
    busy() {
      return document.getAnimations().some((a) => {
        if (!Number.isFinite(endOf(a))) return false;
        const c = controlled.get(a);
        return c ? !c.done : a.playState === 'running';
      });
    },
  };
}

export const clockScript = `(${installVirtualClock.toString()})();`;

const BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const FORMATS = {
  '.mp4': { yuv: true, args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', ...BT709, '-movflags', '+faststart'] },
  '.webm': { yuv: true, args: ['-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p', ...BT709] },
  '.mov': { yuv: false, args: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', ...BT709] },
  '.gif': { yuv: false, maxFps: 30, args: [] },
};

/** Starts a take: the page's clock stops; frame 0 is the picture now. `crop` is a box in CSS px. */
export async function record(page, { dir, crop, fps = 60 }) {
  if ((await readdir(dir).catch(() => [])).length) throw new Error(`${dir} is not empty: use a new directory`);
  if (!(await page.evaluate(() => !!window.__vclock))) throw new Error('clockScript is not installed: addInitScript before goto');
  const take = new Take(page, { dir: path.resolve(dir), crop, fps });
  await page.evaluate(() => window.__vclock.start());
  await take._shoot();
  return take;
}

export class Take {
  constructor(page, { dir, crop, fps }) {
    this.page = page;
    this.dir = dir;
    this.crop = crop;
    this.fps = fps;
    this.interval = 1000 / fps;
    this.frames = [];
    this.state = 'recording';
  }

  async _shoot() {
    if (!this.frames.length) await mkdir(path.join(this.dir, 'frames'), { recursive: true });
    const file = `frames/${String(this.frames.length).padStart(7, '0')}.png`;
    await this.page.screenshot({ path: path.join(this.dir, file), clip: this.crop, scale: 'device', animations: 'allow', caret: 'initial' });
    this.frames.push(file);
  }

  async #render(n) {
    for (let i = 0; i < n; i++) {
      if (this.state !== 'recording') throw new Error('The take is stopped');
      await this.page.evaluate((ms) => window.__vclock.step(ms), this.interval);
      await this._shoot();
    }
  }

  get time() { return (this.frames.length - 1) * this.interval; }
  async step(n = 1) { await this.#render(n); }
  async wait(ms) { await this.#render(Math.round(ms / this.interval)); }
  async move(mouse, x, y) { await mouse.move(x, y); await this.#render(1); }
  /** Input and other calls: the page's handlers run at once, on the stopped clock. */
  async act(action) { return typeof action === 'function' ? action() : action; }
  async until(predicate, { timeout = 10000 } = {}) {
    const limit = this.time + timeout;
    while (!(await predicate())) {
      if (this.time >= limit) throw new Error(`Condition not met within ${timeout} ms of page time`);
      await this.#render(1);
    }
  }
  /** True while a finite animation hasn't reached its end. */
  busy() { return this.page.evaluate(() => window.__vclock.busy()); }

  async stop() {
    this.state = 'done';
    await this.page.evaluate(() => window.__vclock.stop());
    const first = await readFile(path.join(this.dir, this.frames[0]));
    this.report = { frames: this.frames.length, seconds: Number((this.frames.length / this.fps).toFixed(3)), fps: this.fps, framePx: { width: first.readUInt32BE(16), height: first.readUInt32BE(20) } };
    await writeFile(path.join(this.dir, 'report.json'), JSON.stringify(this.report, null, 2) + '\n');
    return this.report;
  }

  async #prepare(output, size) {
    if (this.state !== 'done') throw new Error('Call stop() first');
    return prepare(output, size, [this.report.framePx]);
  }

  async encode({ output, from = 0, to, size, ffmpeg = 'ffmpeg' }) {
    const ext = path.extname(output).toLowerCase();
    const format = FORMATS[ext];
    if (!format) throw new Error(`No encoding for ${ext}`);
    const out = await this.#prepare(output, size);
    const first = Math.round(from / this.interval);
    const last = to === undefined ? this.frames.length - 1 : Math.round(to / this.interval);
    const rate = Math.min(this.fps, format.maxFps ?? this.fps);
    const files = [];
    for (let k = 0; first + Math.round((k * this.fps) / rate) <= last; k++) files.push(this.frames[first + Math.round((k * this.fps) / rate)]);
    const filters = [`scale=${out.width}:${out.height}:flags=lanczos${format.yuv ? ':out_color_matrix=bt709:out_range=tv' : ''}`];
    if (ext === '.gif') filters.push(GIF_PALETTE);
    await runFfmpeg(ffmpeg, ['-f', 'image2pipe', '-framerate', String(rate), '-c:v', 'png', '-i', '-', '-vf', filters.join(','), '-an', ...format.args, path.resolve(output)], files.map((file) => path.join(this.dir, file)));
    return { output: path.resolve(output), ...out, frames: files.length, seconds: Number((files.length / rate).toFixed(3)), fps: rate };
  }

  async still({ output, at, size, ffmpeg = 'ffmpeg' }) {
    const out = await this.#prepare(output, size);
    const index = Math.round(at / this.interval);
    await runFfmpeg(ffmpeg, ['-f', 'image2pipe', '-c:v', 'png', '-i', '-', '-vf', `scale=${out.width}:${out.height}:flags=lanczos`, '-frames:v', '1', path.resolve(output)], [path.join(this.dir, this.frames[index])]);
    return { output: path.resolve(output), ...out, at: index * this.interval };
  }
}

/**
 * Encodes several stopped takes as one video, in order. Each part is a take trimmed
 * to its `from` (and `to`), as in encode(). A part with `crossfade` (ms) dissolves
 * in over the previous part's last frames; without it, it follows with a cut.
 *
 *   await join({ output, size, parts: [{ take: a, from: fromA }, { take: b, from: fromB - 400, crossfade: 400 }] });
 */
export async function join({ output, parts, size, ffmpeg = 'ffmpeg' }) {
  const ext = path.extname(output).toLowerCase();
  const format = FORMATS[ext];
  if (!format) throw new Error(`No encoding for ${ext}`);
  if (parts.some((part) => part.take.state !== 'done')) throw new Error('Call stop() on every take first');
  const fps = parts[0].take.fps;
  if (parts.some((part) => part.take.fps !== fps)) throw new Error('The takes have different frame rates');
  const out = await prepare(output, size, parts.map((part) => part.take.report.framePx));
  const interval = 1000 / fps;
  const inputs = [];
  const graph = [];
  let joined = '';
  let length = 0; // frames joined so far
  parts.forEach((part, i) => {
    const first = Math.round((part.from ?? 0) / interval);
    const last = part.to === undefined ? part.take.frames.length - 1 : Math.round(part.to / interval);
    const count = last - first + 1;
    inputs.push('-framerate', String(fps), '-start_number', String(first), '-i', path.join(part.take.dir, 'frames', '%07d.png'));
    graph.push(`[${i}:v]trim=end_frame=${count},setpts=PTS-STARTPTS,scale=${out.width}:${out.height}:flags=lanczos,setsar=1[p${i}]`);
    if (i === 0) {
      joined = 'p0';
      length = count;
      return;
    }
    const fade = Math.round((part.crossfade ?? 0) / interval);
    if (fade > Math.min(length, count)) throw new Error(`A ${part.crossfade} ms crossfade is longer than a part it joins`);
    graph.push(fade
      ? `[${joined}][p${i}]xfade=transition=fade:duration=${fade / fps}:offset=${(length - fade) / fps}[j${i}]`
      : `[${joined}][p${i}]concat=n=2:v=1:a=0[j${i}]`);
    joined = `j${i}`;
    length += count - fade;
  });
  const rate = Math.min(fps, format.maxFps ?? fps);
  const tail = [];
  if (rate !== fps) tail.push(`fps=${rate}`);
  if (format.yuv) tail.push('scale=out_color_matrix=bt709:out_range=tv');
  if (ext === '.gif') tail.push(GIF_PALETTE);
  graph.push(`[${joined}]${tail.length ? tail.join(',') : 'null'}`);
  await runFfmpeg(ffmpeg, [...inputs, '-filter_complex', graph.join(';'), '-an', ...format.args, path.resolve(output)], []);
  const frames = Math.round((length * rate) / fps);
  return { output: path.resolve(output), ...out, frames, seconds: Number((frames / rate).toFixed(3)), fps: rate };
}

const GIF_PALETTE = 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a';

async function prepare(output, size, framePxs) {
  if (await readFile(output).then(() => true, () => false)) throw new Error(`${output} exists: pick another name`);
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const out = size ?? framePxs[0];
  for (const { width, height } of framePxs) {
    if (out.width > width + 1 || out.height > height + 1) throw new Error(`Would upscale ${width}×${height} to ${out.width}×${out.height}`);
  }
  return { width: out.width, height: out.height };
}

async function runFfmpeg(ffmpeg, args, files) {
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
    child.stdin.on('error', () => {});
    (async () => {
      for (const file of files) {
        if (!child.stdin.write(await readFile(file))) await new Promise((done) => child.stdin.once('drain', done));
      }
      child.stdin.end();
    })().catch(reject);
  });
}
