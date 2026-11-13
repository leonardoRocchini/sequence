# The Control Panel

The picker answers "which scene". The panel answers "how is it shot": theme, frame, background, scale, speed, and pointer. Every control frames or times the component. None of them changes the component's code or styles, and none sets a prop the fixture doesn't already hold. A control that would doesn't belong here.

The panel serves two kinds of capture: the user recording the stage with their own tool, where what's on screen is the shot, and `/sequence-take`, which can't see the user's browser. So every value the panel holds is persisted, and the stage saves all of it to a file `/sequence-script` reads ("Stage state" below).

## DialKit

[DialKit](https://github.com/joshpuckett/dialkit) is the fast path in a React project: selects and action buttons, values saved to `localStorage`, no panel UI to build. Plain `<select>`, `<input>`, and `<button>` elements are fine everywhere else, inside one `<div class="stage-panel">` (the drawn pointer and clean mode find it by that class); give each control `data-stage-control="<key>"` (`theme`, `speed`, `pointer`, `backgroundColor`, …) so `/sequence-take` can set it. Don't build a custom panel, and don't study DialKit's source or README: wire it from the shape below.

The panel holds these controls, and nothing else:

| Control | DialKit type | Options |
| --- | --- | --- |
| Theme | select | the project's themes from Phase 1 recon, usually Light, Dark. Left out with a single theme |
| Frame | select | Auto, 16:9 · 1280×720, 4:3 · 1024×768, 1:1 · 800×800, 4:5 · 864×1080, 9:16 · 450×800 (STAGE.md) |
| Background | select | Original (the token from Phase 2 recon), Custom (default Original) |
| Custom color | color | the hex used when Background is Custom (plain panel: a text input for `#RRGGBB`) |
| Scale | select | 1×, 1.5×, 2× |
| Speed | select | 1×, 0.5×, 0.25× |
| Pointer | select | System, Hidden, Arrow, Dot (default System) |
| Replay | action | remounts the current scene (same as `R`) |
| Copy for script | action | only on a host with no server route: copies the stage state ("Stage state" below) |

Put the frame size in the option label, so the panel shows the px to set in the capture tool.

Theme is there only when the project has two or more themes. With one, a select would offer a single option that sets nothing, so the stage has no Theme control, the stage state has no `theme`, and the script no Theme line.

React shape, from `dialkit` 2.x (the vanilla `createDialKit()` takes the same config). Select options are plain strings or `{ value, label }`, and each value is read as `stage.<key>`:

```jsx
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";

const stage = useDialKit("Stage", {
  theme: { type: "select", options: ["Light", "Dark"] },  // only with two or more themes
  frame: { type: "select", options: [{ value: "auto", label: "Auto" }, { value: "16x9", label: "16:9 · 1280×720" }, { value: "4x3", label: "4:3 · 1024×768" }, { value: "1x1", label: "1:1 · 800×800" }, { value: "4x5", label: "4:5 · 864×1080" }, { value: "9x16", label: "9:16 · 450×800" }] },
  background: { type: "select", options: ["Original", "Custom"] },
  backgroundColor: { type: "color", default: "#111111" },
  scale: { type: "select", options: ["1×", "1.5×", "2×"] },
  speed: { type: "select", options: ["1×", "0.5×", "0.25×"] },
  pointer: { type: "select", options: ["System", "Hidden", "Arrow", "Dot"] },
  replay: { type: "action" },
  copy: { type: "action", label: "Copy for script" }, // only without a server route
}, {
  id: "isolate:<component>:<stamp>",  // the storage key (SKILL.md, Phase 4): values survive the clean-mode unmount, not a rebuilt stage
  persist: true,                       // localStorage key `dialkit:isolate:<component>:<stamp>`
  onAction: (path) => {
    if (path === "replay") replay();
    if (path === "copy") copyState(currentState());
  },
});

// In the stage's JSX, only while chrome is visible:
{!clean && <DialRoot position="top-right" theme="dark" />}
```

Wiring rules:

- **Values go to the stage, never into the component.** Theme goes to the theme mechanism (STAGE.md). Frame, background, and scale go to `data-frame`, `--stage-bg`, and `--stage-scale` on the stage root, as CSS variables, not React state that re-renders the tree. Background `Custom` sets `--stage-bg` to the Custom color; `Original` sets it to the Phase 2 token's variable and ignores the color. Speed goes to `setSpeed()`. Pointer: `System` leaves the system pointer alone, `Hidden` sets `data-cursor="hidden"`, and `Arrow` or `Dot` calls `installPointer(root, "arrow" | "dot")` from STAGE.md (uninstalling the previous one first). Uninstall it when the option changes back or the stage unmounts. It's optional: a capture that doesn't need a pointer leaves it on `System`.
- **Persist.** Turn on DialKit's `persist` option so a reload brings back the panel's values. The URL stays fixed. A plain panel persists the same values under the stage's storage key (SKILL.md, Phase 4).
- **Top-right.** Place the panel top-right, clear of the picker's bottom-center pill. If the component occupies the top-right of the frame, use top-left.
- **Clean mode removes it.** Render `<DialRoot>` (or mount the vanilla panel) only while chrome is visible. When `H` turns on clean mode, unmount it rather than hiding it with CSS: DialKit may portal outside any wrapper you'd target. Its values live in its store, so they survive the unmount.
- **The dependency is part of the stage.** If the project doesn't already have DialKit, install it without asking: `done` removes it, so it lasts as long as the stage. Installing it changes the package manifest and the lockfile, which are tracked files, so say so in one line before installing (`Adding dialkit and motion to apps/web for the panel; done removes them.`) and list them in the handoff (SKILL.md, Phase 5). Record it in the exclude block as `# dependency: dialkit (<package dir>)` before installing, so `done` removes it with the package manager. Never use `git checkout` on those files: they may hold the user's own uncommitted changes. If DialKit's peer dependency (`motion`) isn't already in the project, record that too. If the project already had DialKit, record nothing and leave it. A DialKit that another stage installed isn't the project's: if another `# isolate:` block in the exclude file records it, record it in this block too, so the teardown of the other stage doesn't remove it from under this one (SKILL.md, Phase 6). Same for `motion`.

## Stage state

Everything the panel holds, in one JSON file `/sequence-script` reads, so the interview starts from what the user already set instead of asking again. Claude can't read the user's browser, so the stage writes the file itself. [templates/state.ts](templates/state.ts) has the shape and the two ways out: `saveState()` and `copyState()`. Copy it with `cp`, don't retype it.

```json
{
  "component": "command-bar",
  "scene": "Default",
  "stage": { "theme": "Dark", "frame": "16:9 · 1280×720", "background": "Custom", "backgroundColor": "#0E1116", "scale": "1×", "speed": "0.25×", "pointer": "Arrow" },
  "versions": [
    { "name": "V1", "stage": { "theme": "Dark", "frame": "16:9 · 1280×720", "background": "Custom", "backgroundColor": "#0E1116", "scale": "1×", "speed": "0.25×", "pointer": "Arrow" } },
    { "name": "V2", "stage": { "theme": "Light", "frame": "1:1 · 800×800", "background": "Original", "backgroundColor": "#111111", "scale": "2×", "speed": "1×", "pointer": "Arrow" } }
  ]
}
```

- **No theme, no key.** A stage without the Theme control leaves `theme` out of `stage` and of every version.
- **Values are labels.** Every value is what the panel shows (`16:9 · 1280×720`, `0.25×`), so the script copies them as they are.
- **Versions.** DialKit's versions are the base version plus the presets "Save version" adds. Names default to `V1` for the base and `V2`, `V3`, … for the presets, and the user can rename them. List the base first: `DialStore.getBaseName(id)`, with its values from the persisted panel (`baseValues` in the JSON at `DialStore.getPresetStorage(id)`) while a preset is active, and from the live values otherwise. DialStore has no getter for them, and leaving the base out loses a version: with `V2` loaded, `stage` holds V2's values and nothing holds V1's. Then each of `DialStore.getPresets(id)`. Map each one to the same shape as `stage` and leave out the actions. `stage` is whichever version is loaded, so a version equal to it is the active one, not a duplicate. A version holds the shooting settings only, not the scene. A plain panel has no versions, so it writes `[]`.
- **When to save.** On every change of the panel's values, the versions (`DialStore.subscribe("isolate:<component>:<stamp>", …)` fires on save, load, and delete), and the scene. `saveState()` debounces and skips identical writes.
- **No timestamp.** The file's modification time says how old it is. A `Date.now()` in the stage would break the determinism grep (SKILL.md, Phase 3).

### Where it goes

`stage-state.json` in the stage directory, already covered by the exclude block and deleted by `done`. Nothing imports it, so the dev server doesn't reload on a write. The stage POSTs it to a dev-only route of its own, which writes that one path:

| Host | Route |
| --- | --- |
| Next.js App Router | `state/route.ts` under the stage's route folder: `POST /isolate/<component>/state` |
| SvelteKit | `state/+server.ts` under the stage's route folder |
| Nuxt | `server/api/isolate/<component>/state.post.ts`, a second path in the exclude block |
| React Router framework mode, TanStack Start, Remix | a resource route with an action under the stage's route |

Next.js shape. The others follow it: 404 outside development, refuse a body for another component, write one fixed path, nothing else.

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const state = await req.json();
  if (state?.component !== "<component>") return new Response(null, { status: 400 });
  await writeFile(join(process.cwd(), "<stage dir, relative to the app>", "stage-state.json"), JSON.stringify(state, null, 2) + "\n");
  return new Response(null, { status: 204 });
}
```

**No server route.** A Vite page with no router, a client-only router (React Router or TanStack Router as an SPA), and a static site can't write files, and adding a route there would mean editing the project's config. Those stages skip the route and put a "Copy for script" action in the panel instead: `copyState()` copies the same JSON, for the user to paste into `/sequence-script`. A stage with the route has no such action.

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

**Clean mode hides everything, speed included.** Nothing on screen says the recording is slowed down. That is deliberate, because the capture must be clean. Check the speed in the panel before recording.
