# The Control Panel

The picker answers "which scene". The panel answers "how is it shot": theme, frame, background, scale, speed, and pointer. Every control frames or times the component. None of them changes it. A control that would alter the component's props, values, or styles doesn't belong here.

## DialKit

[DialKit](https://github.com/joshpuckett/dialkit) is the fast path in a React project: selects and action buttons, values saved to `localStorage`, no panel UI to build. Plain `<select>` and `<button>` elements are fine everywhere else, inside one `<div class="stage-panel">` (the drawn pointer and clean mode find it by that class); give each select `data-stage-control="<key>"` (`theme`, `speed`, `pointer`, …) so `/sequence-take` can set it. Don't build a custom panel, and don't study DialKit's source or README: wire it from the shape below.

The panel holds these controls, and nothing else:

| Control | DialKit type | Options |
| --- | --- | --- |
| Theme | select | Light, Dark |
| Frame | select | Auto, 16:9 · 1280×720, 4:3 · 1024×768, 1:1 · 800×800, 4:5 · 864×1080, 9:16 · 450×800 (STAGE.md) |
| Background | select | the 2–3 tokens from Phase 2 recon |
| Scale | select | 1×, 1.5×, 2× |
| Speed | select | 1×, 0.5×, 0.25× |
| Pointer | select | System, Hidden, Arrow, Dot (default System) |
| Replay | action | remounts the current scene (same as `R`) |

Put the frame size in the option label, so the panel shows the px to set in the capture tool.

React shape, from `dialkit` 2.x (the vanilla `createDialKit()` takes the same config). Select options are plain strings or `{ value, label }`, and each value is read as `stage.<key>`:

```jsx
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";

const stage = useDialKit("Stage", {
  theme: { type: "select", options: ["Light", "Dark"] },
  frame: { type: "select", options: [{ value: "auto", label: "Auto" }, { value: "16x9", label: "16:9 · 1280×720" }, { value: "4x3", label: "4:3 · 1024×768" }, { value: "1x1", label: "1:1 · 800×800" }, { value: "4x5", label: "4:5 · 864×1080" }, { value: "9x16", label: "9:16 · 450×800" }] },
  background: { type: "select", options: ["Canvas", "Surface"] },
  scale: { type: "select", options: ["1×", "1.5×", "2×"] },
  speed: { type: "select", options: ["1×", "0.5×", "0.25×"] },
  pointer: { type: "select", options: ["System", "Hidden", "Arrow", "Dot"] },
  replay: { type: "action" },
}, {
  id: "isolate:<component>",  // stable id: values survive the clean-mode unmount
  persist: true,               // localStorage key `dialkit:isolate:<component>`
  onAction: (path) => { if (path === "replay") replay(); },
});

// In the stage's JSX, only while chrome is visible:
{!clean && <DialRoot position="top-right" theme="dark" />}
```

Wiring rules:

- **Values go to the stage, never into the component.** Theme goes to the theme mechanism (STAGE.md). Frame, background, and scale go to `data-frame`, `--stage-bg`, and `--stage-scale` on the stage root, as CSS variables, not React state that re-renders the tree. Speed goes to `setSpeed()`. Pointer: `System` leaves the system pointer alone, `Hidden` sets `data-cursor="hidden"`, and `Arrow` or `Dot` calls `installPointer(root, "arrow" | "dot")` from STAGE.md (uninstalling the previous one first). Uninstall it when the option changes back or the stage unmounts. It's optional: a capture that doesn't need a pointer leaves it on `System`.
- **Persist.** Turn on DialKit's `persist` option so a reload brings back the panel's values. The URL stays fixed.
- **Top-right.** Place the panel top-right, clear of the picker's bottom-center pill. If the component occupies the top-right of the frame, use top-left.
- **Clean mode removes it.** Render `<DialRoot>` (or mount the vanilla panel) only while chrome is visible. When `H` turns on clean mode, unmount it rather than hiding it with CSS: DialKit may portal outside any wrapper you'd target. Its values live in its store, so they survive the unmount.
- **The dependency is part of the stage.** If the project doesn't already have DialKit, installing it changes the package manifest and the lockfile, which are tracked files. Record it in the exclude block as `# dependency: dialkit (<package dir>)` before installing, so `done` removes it with the package manager. Never use `git checkout` on those files: they may hold the user's own uncommitted changes. If DialKit's peer dependency (`motion`) isn't already in the project, record that too. If the project already had DialKit, record nothing and leave it.

## Speed

Most motion problems, and most good motion, is invisible at full speed. At 0.25x a recording shows what the entrance actually does. Speed slows **time**, not the component: the component's code and values stay untouched, and only the clock it reads from runs slower. That keeps hard rule 1 intact.

Motion on the web runs on two clocks, and the multiplier has to slow both:

1. **Web Animations.** CSS animations, CSS transitions, `element.animate()`, and the hardware-accelerated animations of libraries like `motion` all show up in `document.getAnimations()`. Each one gets `updatePlaybackRate(speed)`, re-applied every frame because new animations start all the time.
2. **JS clocks.** Spring physics, `motion`'s frame loop, GSAP, and timer-based delays read `performance.now()`, the `requestAnimationFrame` timestamp, and `setTimeout`. A virtual clock replaces them with time that advances at `speed`, rebased on every change so time never jumps.

The picker and the drawn pointer are excluded from the Web Animations sync: the pointer follows real input, which isn't slowed. DialKit's own panel animations may run slow at 0.25x. That's harmless, because the panel is never in the shot. `Date.now()` is left alone, since fixtures already freeze dates.

Install the clock before the component mounts (STAGE.md's mount gate waits for it), and uninstall it on unmount.

The clock is [templates/clock.ts](templates/clock.ts): `installClock()` returns its uninstall function, and `setSpeed(n)` changes the speed. Copy it with `cp`, don't retype it.

**What can escape it.** A library that captured `performance.now` or `requestAnimationFrame` by reference before the clock was installed keeps reading real time. That happens at import, in the first line of a module. The stage doesn't check for it: an animation that doesn't slow down at 0.25x shows it. Don't patch the component to fix it.

## Keys

One listener on `document` handles the stage's own keys; its plain-JS form is in PICKER.md's reference wiring. The panel's controls stay in the panel.

| Key | Action |
| --- | --- |
| `1–9`, `←`, `→` | switch scene (PICKER.md) |
| `R` | replay: remount the current scene |
| `H` | toggle clean mode (`data-stage-clean` on `html`, and unmount the panel) |

Ignore keys while focus is in an input, textarea, select, or contenteditable, or while a modifier is held, so the component's own shortcuts keep working.

**Clean mode hides everything, speed included.** Nothing on screen says the recording is slowed down. That is deliberate, because the capture must be clean. The handoff reminds the user to check the speed before recording.
