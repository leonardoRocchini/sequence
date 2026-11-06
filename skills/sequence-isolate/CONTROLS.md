# The Control Panel

The picker answers "which scene". The panel answers "how is it shot": theme, frame, background, scale, speed, and pointer, plus the scene's text. Every control frames or times the component, or edits the fixture text it receives. None of them changes the component's code or styles, and none sets a prop the fixture doesn't already hold. A control that would doesn't belong here.

The panel serves two kinds of capture: the user recording the stage with their own tool, where what's on screen is the shot, and `/sequence-take`, which can't see the user's browser. So every value the panel holds is persisted, and the stage saves all of it to a file `/sequence-script` reads ("Stage state" below).

## DialKit

[DialKit](https://github.com/joshpuckett/dialkit) is the fast path in a React project: selects and action buttons, values saved to `localStorage`, no panel UI to build. Plain `<select>`, `<input>`, and `<button>` elements are fine everywhere else, inside one `<div class="stage-panel">` (the drawn pointer and clean mode find it by that class); give each control `data-stage-control="<key>"` (`theme`, `speed`, `pointer`, `backgroundColor`, …) so `/sequence-take` can set it. Don't build a custom panel, and don't study DialKit's source or README: wire it from the shape below.

The panel holds these controls, and nothing else:

| Control | DialKit type | Options |
| --- | --- | --- |
| Theme | select | Light, Dark |
| Frame | select | Auto, 16:9 · 1280×720, 4:3 · 1024×768, 1:1 · 800×800, 4:5 · 864×1080, 9:16 · 450×800 (STAGE.md) |
| Background | select | the 2–3 tokens from Phase 2 recon, then Custom |
| Custom color | color | the hex used when Background is Custom (plain panel: a text input for `#RRGGBB`) |
| Scale | select | 1×, 1.5×, 2× |
| Speed | select | 1×, 0.5×, 0.25× |
| Pointer | select | System, Hidden, Arrow, Dot (default System) |
| Replay | action | remounts the current scene (same as `R`) |
| Copy for script | action | only on a host with no server route: copies the stage state ("Stage state" below) |
| Content | text, one per editable path | its own panel, for the current scene ("Content" below) |

Put the frame size in the option label, so the panel shows the px to set in the capture tool.

React shape, from `dialkit` 2.x (the vanilla `createDialKit()` takes the same config). Select options are plain strings or `{ value, label }`, and each value is read as `stage.<key>`:

```jsx
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";

const stage = useDialKit("Stage", {
  theme: { type: "select", options: ["Light", "Dark"] },
  frame: { type: "select", options: [{ value: "auto", label: "Auto" }, { value: "16x9", label: "16:9 · 1280×720" }, { value: "4x3", label: "4:3 · 1024×768" }, { value: "1x1", label: "1:1 · 800×800" }, { value: "4x5", label: "4:5 · 864×1080" }, { value: "9x16", label: "9:16 · 450×800" }] },
  background: { type: "select", options: ["Canvas", "Surface", "Custom"] },
  backgroundColor: { type: "color", default: "#111111" },
  scale: { type: "select", options: ["1×", "1.5×", "2×"] },
  speed: { type: "select", options: ["1×", "0.5×", "0.25×"] },
  pointer: { type: "select", options: ["System", "Hidden", "Arrow", "Dot"] },
  replay: { type: "action" },
  copy: { type: "action", label: "Copy for script" }, // only without a server route
}, {
  id: "isolate:<component>",  // stable id: values survive the clean-mode unmount
  persist: true,               // localStorage key `dialkit:isolate:<component>`
  onAction: (path) => {
    if (path === "replay") replay();
    if (path === "copy") copyState(currentState());
  },
});

// In the stage's JSX, only while chrome is visible:
{!clean && <DialRoot position="top-right" theme="dark" />}
```

Wiring rules:

- **Values go to the stage, never into the component.** Theme goes to the theme mechanism (STAGE.md). Frame, background, and scale go to `data-frame`, `--stage-bg`, and `--stage-scale` on the stage root, as CSS variables, not React state that re-renders the tree. Background `Custom` sets `--stage-bg` to the Custom color; a token sets it to the token's variable and ignores the color. Speed goes to `setSpeed()`. Pointer: `System` leaves the system pointer alone, `Hidden` sets `data-cursor="hidden"`, and `Arrow` or `Dot` calls `installPointer(root, "arrow" | "dot")` from STAGE.md (uninstalling the previous one first). Uninstall it when the option changes back or the stage unmounts. It's optional: a capture that doesn't need a pointer leaves it on `System`.
- **Persist.** Turn on DialKit's `persist` option so a reload brings back the panel's values. The URL stays fixed.
- **Top-right.** Place the panel top-right, clear of the picker's bottom-center pill. If the component occupies the top-right of the frame, use top-left.
- **Clean mode removes it.** Render `<DialRoot>` (or mount the vanilla panel) only while chrome is visible. When `H` turns on clean mode, unmount it rather than hiding it with CSS: DialKit may portal outside any wrapper you'd target. Its values live in its store, so they survive the unmount.
- **The dependency is part of the stage.** If the project doesn't already have DialKit, installing it changes the package manifest and the lockfile, which are tracked files. Record it in the exclude block as `# dependency: dialkit (<package dir>)` before installing, so `done` removes it with the package manager. Never use `git checkout` on those files: they may hold the user's own uncommitted changes. If DialKit's peer dependency (`motion`) isn't already in the project, record that too. If the project already had DialKit, record nothing and leave it. A DialKit that another stage installed isn't the project's: if another `# isolate:` block in the exclude file records it, record it in this block too, so the teardown of the other stage doesn't remove it from under this one (SKILL.md, Phase 6). Same for `motion`.

## Content

The fixture's text, editable in place: a title that reads better on camera, a name that fits the frame, without asking Claude to edit a file. The fields edit the fixture the component receives, never the component's DOM. A `contenteditable` component would get its text rewritten by the next render or replay, show a caret on camera, and change a DOM the component owns.

- **Which fields.** Only the paths the fixture file lists as editable for that scene (SKILL.md, Phase 3): displayed text, never ids, URLs, dates, or enum values, whose change would break the component's types or the determinism. Text written in the component's own code isn't fixture text, so it has no field: it's the product.
- **Store.** [templates/content.ts](templates/content.ts) owns one `localStorage` key, `isolate:<component>:content`, holding `{ "<scene name>": { "<path>": "<text>" } }`. Paths are fixture paths (`items[0].title`), so they survive a panel rebuild and read the same in `script.md`. Copy it with `cp`, don't retype it. DialKit's `persist` doesn't store content: the key does.
- **Apply.** The stage keeps the current scene's overrides in state, read with `readContent()` on every mount (scene switch, replay, load), and renders the component with `applyContent(fixture, overrides)`. Reading on every mount is the contract `/sequence-take` relies on: it writes the key, presses `R`, and the scene mounts with its text. `applyContent` sets `data-stage-content` on `html` to `ok`, or to `missing:<paths>` when an override no longer matches the fixture (the fixture changed after the text was edited). Never drop a missing override silently.
- **Edit.** A field change calls `writeContent()` and updates the state, so the component re-renders with the new props and keeps its key: typing never replays the entrance. An empty field is a valid text; Reset is the way back to the fixture.
- **Panel.** A second DialKit panel, `Content`, rendered by a child keyed by the scene so its config follows the scene: one `text` control per editable path (label: the path's last segment, or a short name when two collide), defaulting to the current text (`getText` on the applied fixture), plus a `reset` action that calls `resetContent()` for the scene. Give it `id: "isolate:<component>:content:<scene>"` and no `persist`. Write its changes to the key from an effect on the values it returns, and only real changes: a value equal to the fixture's own text removes the override (`writeContent(…, null)`), so the key and the stage state hold only what the user actually changed. Like the main panel, it's unmounted in clean mode. A plain panel uses one `<input data-stage-content="<path>">` per path inside `.stage-panel`, and remounts the scene on input if the stage can't re-render in place. A scene with no editable paths has no Content panel.

## Stage state

Everything the panel holds, in one JSON file `/sequence-script` reads, so the interview starts from what the user already set instead of asking again. Claude can't read the user's browser, so the stage writes the file itself. [templates/state.ts](templates/state.ts) has the shape and the two ways out: `saveState()` and `copyState()`. Copy it with `cp`, don't retype it.

```json
{
  "component": "command-bar",
  "scene": "Default",
  "stage": { "theme": "Dark", "frame": "16:9 · 1280×720", "background": "Custom", "backgroundColor": "#0E1116", "scale": "1×", "speed": "0.25×", "pointer": "Arrow" },
  "versions": [
    { "name": "V1", "stage": { "theme": "Dark", "frame": "16:9 · 1280×720", "background": "Custom", "backgroundColor": "#0E1116", "scale": "1×", "speed": "0.25×", "pointer": "Arrow" } },
    { "name": "V2", "stage": { "theme": "Light", "frame": "1:1 · 800×800", "background": "Surface", "backgroundColor": "#111111", "scale": "2×", "speed": "1×", "pointer": "Arrow" } }
  ],
  "content": { "Default": { "items[0].title": "Q3 roadmap review" } }
}
```

- **Values are labels.** Every value is what the panel shows (`16:9 · 1280×720`, `0.25×`), so the script copies them as they are.
- **Versions.** DialKit's versions are the base version plus the presets "Save version" adds. Names default to `V1` for the base and `V2`, `V3`, … for the presets, and the user can rename them. List the base first: `DialStore.getBaseName(id)`, with its values from the persisted panel (`baseValues` in the JSON at `DialStore.getPresetStorage(id)`) while a preset is active, and from the live values otherwise. DialStore has no getter for them, and leaving the base out loses a version: with `V2` loaded, `stage` holds V2's values and nothing holds V1's. Then each of `DialStore.getPresets(id)`. Map each one to the same shape as `stage` and leave out the actions. `stage` is whichever version is loaded, so a version equal to it is the active one, not a duplicate. A version holds the shooting settings only: not the scene, not the text. A plain panel has no versions, so it writes `[]`.
- **When to save.** On every change of the panel's values, the versions (`DialStore.subscribe("isolate:<component>", …)` fires on save, load, and delete), the scene, and the content. `saveState()` debounces and skips identical writes.
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

**Clean mode hides everything, speed included.** Nothing on screen says the recording is slowed down. That is deliberate, because the capture must be clean. The handoff reminds the user to check the speed before recording.
