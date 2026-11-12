// Speed clock: slows the component's time without touching its code.
// Nothing touches `window` at module load: Next.js evaluates the module on the server too.
const now = performance.now.bind(performance);
let real: {
  raf: typeof requestAnimationFrame;
  caf: typeof cancelAnimationFrame;
  setTimeout: typeof setTimeout;
  setInterval: typeof setInterval;
};
let speed = 1;
let realBase = now();
let virtualBase = realBase;
const virtualNow = () => virtualBase + (now() - realBase) * speed;

export function setSpeed(next: number) {
  virtualBase = virtualNow(); // rebase, so time never jumps
  realBase = now();
  speed = next;
}

export function installClock() {
  // Saved on the first install only, so a second install never saves the scaled ones.
  real ??= {
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
  };
  performance.now = virtualNow;
  window.requestAnimationFrame = (cb) => real.raf(() => cb(virtualNow()));
  // Object.assign, not assignment: with @types/node the scaled timers don't match
  // the globals' type, without it they do, and a stage must typecheck either way.
  Object.assign(window, {
    setTimeout: (fn: TimerHandler, ms = 0, ...args: unknown[]) => real.setTimeout(fn, ms / speed, ...args),
    setInterval: (fn: TimerHandler, ms = 0, ...args: unknown[]) => real.setInterval(fn, ms / speed, ...args),
  });

  let frame = real.raf(function sync() {
    for (const anim of document.getAnimations()) {
      const target = (anim.effect as KeyframeEffect | null)?.target;
      if (target?.closest?.(".stage-picker, .stage-pointer")) continue;
      if (anim.playbackRate !== speed) anim.updatePlaybackRate(speed);
    }
    frame = real.raf(sync);
  });

  return function uninstallClock() {
    real.caf(frame);
    // @ts-expect-error -- restores the prototype's own now()
    delete performance.now;
    window.requestAnimationFrame = real.raf;
    window.setTimeout = real.setTimeout;
    window.setInterval = real.setInterval;
    for (const anim of document.getAnimations()) anim.updatePlaybackRate(1);
  };
}
