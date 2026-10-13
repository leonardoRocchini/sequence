// Speed clock: slows the component's time without touching its code.
const real = {
  now: performance.now.bind(performance),
  raf: window.requestAnimationFrame.bind(window),
  caf: window.cancelAnimationFrame.bind(window),
  setTimeout: window.setTimeout.bind(window),
  setInterval: window.setInterval.bind(window),
};
let speed = 1;
let realBase = real.now();
let virtualBase = realBase;
const virtualNow = () => virtualBase + (real.now() - realBase) * speed;

export function setSpeed(next: number) {
  virtualBase = virtualNow(); // rebase, so time never jumps
  realBase = real.now();
  speed = next;
}

export function installClock() {
  performance.now = virtualNow;
  window.requestAnimationFrame = (cb) => real.raf(() => cb(virtualNow()));
  // @ts-expect-error -- the stage swaps the timer globals for scaled ones
  window.setTimeout = (fn: TimerHandler, ms = 0, ...args: unknown[]) => real.setTimeout(fn, ms / speed, ...args);
  // @ts-expect-error -- the stage swaps the timer globals for scaled ones
  window.setInterval = (fn: TimerHandler, ms = 0, ...args: unknown[]) => real.setInterval(fn, ms / speed, ...args);

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
