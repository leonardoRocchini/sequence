# The Script Format

`script.md` is the direction for one capture session. `/sequence-script` writes it, `/sequence-take` reads it, and this file is the contract between them. It's a direction document, not code: natural language is allowed, and explicit details override defaults.

## Shape

```md
# Capture — Command bar

## Stage
- URL: /isolate/command-bar
- Frame: 16:9 · 1280×720
- Theme: Dark
- Background: Canvas
- Scale: 1×
- Pointer: Arrow

## Output
- Directory: artifacts/captures/command-bar
- Pixel density: 2×

## Scene: Default
- Picker scene: Default
- Capture: screenshot, command-bar-default.png

## Scene: Opening
- Picker scene: Default
- Speed: 0.25×
- Reset to: replay (R)
- Action: press ⌘K
- Wait for: the input is visible and focused
- Capture: video, command-bar-opening.webm

## Scene: Typing
- Picker scene: Default
- Reset to: replay (R)
- Action: press ⌘K, then type "design"
- Wait for: results list shows "Design tokens"
- Capture: frames at 0, 120, 240 ms after the first keystroke, command-bar-typing-{ms}.png

## Notes
- Inferred: theme Dark, since the user said "the dark one".
- Limitation: the result list's spring ignores the speed multiplier (from /sequence-isolate's handoff).
```

## Fields

**Stage.** The values are the `/sequence-isolate` panel's own options ([CONTROLS.md](../../sequence-isolate/CONTROLS.md)): Frame, Theme, Background, Scale, Speed, Pointer. Pointer is `System`, `Hidden`, `Arrow`, or `Dot`. Only `Arrow` and `Dot` put a pointer in an automated capture, because they're drawn by the stage; the system pointer never appears in one. Never a raw viewport size, because the frame preset defines the capture size. A scene can override any of them (`Speed: 0.25×` above).

**Output.** Directory defaults to `artifacts/captures/<component>/`. Pixel density is the device scale factor for screenshots and frames (default 2×, so files are twice the frame's px). Video gets the same density through a larger viewport and the stage's Scale, not the device scale factor (SKILL.md, "Video size").

**Scene.** One block per capture, in shooting order.

| Field | Meaning |
| --- | --- |
| `Picker scene` | A tab that exists on the stage's picker. Scenes are tabs, never URL params. |
| `Reset to` | How to get a clean starting point: `replay (R)`, or real interactions. Never by changing component state. |
| `Action` | Real interactions: click, hover, focus, keys, typing, scroll, drag. Several are allowed, in order. |
| `Wait for` | An observable condition: an element visible, a label changed, an animation finished. A fixed delay only when the scene captures at timed offsets. |
| `Capture` | `screenshot`, `frames at <offsets>`, or `video`, then the filename. `{ms}` in a filename is replaced by the offset. |

A **scene** is a starting state plus what's shot from it. Hover, open, and typing are actions inside a scene, not scenes of their own, and a stage scene can be used by several script scenes.

**Notes.** Anything inferred rather than said by the user, and every known limitation. `/sequence-take` repeats them in its handoff.
