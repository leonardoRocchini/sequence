# The Script Format

`script.md` is the direction for one capture session. `/sequence-script` writes it, `/sequence-take` reads it, and this file is the contract between them. It's a direction document, not code: natural language is allowed, and explicit details override defaults.

## Shape

```md
# Capture — Command bar

## Stage
- URL: /isolate/command-bar
- Frame: 16:9 · 1280×720 CSS px
- Theme: Dark
- Background: Original
- Scale: 1×
- Pointer: Arrow

## Output
- Directory: artifacts/captures/command-bar
- Resolution: 1440p · 2560×1440 px (2×)

## Scene: Default
- Picker scene: Default
- Capture: screenshot, command-bar-default.png

## Scene: Opening, dark
- Picker scene: Default
- Speed: 0.25×
- Reset to: replay (R)
- Action: press ⌘K
- Wait for: the input is visible and focused
- Hold: 1 s
- Capture: video, command-bar-opening-dark.mp4

## Scene: Opening, light
- Picker scene: Default
- Theme: Light
- Speed: 0.25×
- Reset to: replay (R)
- Action: press ⌘K
- Wait for: the input is visible and focused
- Hold: 1 s
- Capture: video, command-bar-opening-light.mp4

## Scene: Typing
- Picker scene: Default
- Reset to: replay (R)
- Action: press ⌘K, then type "design"
- Wait for: results list shows "Design tokens"
- Capture: frames at 0, 120, 240 ms after the first keystroke, command-bar-typing-{ms}.png

## Notes
- Inferred: theme Dark, since the user said "the dark one".
- Limitation: the result list's spring ignores the speed multiplier (it captures `requestAnimationFrame` at import).
```

## Fields

**Stage.** The values are the `/sequence-isolate` panel's own options ([CONTROLS.md](../../sequence-isolate/CONTROLS.md)): Frame, Theme, Background, Scale, Speed, Pointer. Frame is the panel option followed by `CSS px`: those px are the layout space the component is composed in, not the file's size, which is Output's Resolution. Background is `Original` (the token the component sits on in the app) or `Custom` followed by a hex (`Custom #0E1116`). Pointer is `System`, `Hidden`, `Arrow`, or `Dot`. Only `Arrow` and `Dot` put a pointer in an automated capture, because they're drawn by the stage; the system pointer never appears in one. Never a raw viewport size, because the frame preset defines the composition and Output's Resolution defines the file size. Theme is written only when the stage's panel has it, which it does only with two or more themes. A scene can override any of them (`Speed: 0.25×` and `Theme: Light` above).

**Output.** Directory defaults to `artifacts/captures/<component>/`.

Resolution is the pixel size of every file, and it's separate from the frame. The frame sets the composition: aspect ratio and the CSS px the component is laid out in. Resolution only sets how many pixels render that composition, so changing it never moves or resizes anything inside the frame. Choose it in one of three forms:

| Form | Example | Meaning |
| --- | --- | --- |
| Tier | `1080p · 1080×1080` | The frame's short side gets the tier's px, the long side follows the aspect. Tiers: `720p`, `1080p` (Full HD), `1440p` (2K), `2160p` (4K). Always write the resulting px after the tier, so "2K" can't be read as 2048. |
| Size | `1350×1350` | Explicit px. Must have the frame's aspect ratio. |
| Density | `2×` | The frame's px times a factor: a 1280×720 frame at 2× is 2560×1440. |

Default `2×`. Whatever the form, write the line resolved: the form, the px, and the density *d* = resolution ÷ frame px, as in `1080p · 1080×1080 px (1.35×)` or `2× · 1600×1600 px (2×)`. The px are what the take must deliver.

The density may be fractional: a 1:1 · 800×800 frame at 1080p is 1.35×. An integer density is crisp: every CSS px maps to whole device pixels. A fractional one softens what sits on the CSS pixel grid: 1 px borders, dividers, and focus rings land between device pixels and render antialiased, and small icons lose sharpness. Text and gradients barely change. A fractional density is allowed, but only as a choice: record it in Notes (`Resolution 1080p is 1.35×: 1 px borders render soft, chosen for the Instagram post size`). A resolution with a different aspect ratio from the frame is an error, never a crop or a stretch: change the frame or the resolution. A resolution below the frame's px is allowed (720p of an 800×800 frame is 0.9×). With Frame `Auto` there are no preset px: write Resolution as a size, and the take uses it as the viewport at 1×.

A scene can override Resolution, like any Stage value.

Video format is the filename's extension. Each one stands for one encoding, so the script never names a codec:

| Extension | Encoding | For |
| --- | --- | --- |
| `.mp4` | H.264, yuv420p, faststart | Social, portfolio, slides: plays everywhere. The default. |
| `.webm` | VP9 | Web pages and docs that embed `<video>`. |
| `.gif` | Palette per file, at most 30 fps | READMEs and places that don't play video. Large and lossy in color: offer it only for short loops. |
| `.mov` | ProRes 422 HQ | Editing in a video editor afterwards. Large files. |

`.mp4` needs even pixel sizes, so its Resolution can't have an odd side.

**Scene.** One block per shot, in shooting order. A shot is one capture, except in a joined video (see "Joined scenes").

| Field | Meaning |
| --- | --- |
| `Picker scene` | A tab that exists on the stage's picker. Scenes are tabs, never URL params. |
| `Reset to` | How to get a clean starting point: `replay (R)`, or real interactions. Never by changing component state. |
| `Action` | Real interactions: click, hover, focus, keys, typing, scroll, drag. Several are allowed, in order. Never a switch of picker scene: it remounts the component, which is a hard cut in a video. Two picker scenes in one video are two scenes joined (see "Joined scenes"). |
| `Wait for` | An observable condition: an element visible, a label changed, an animation finished. A fixed delay only when the scene captures at timed offsets. Write what the viewer sees, not code: the take chooses the check, and a check written for a live page can't come true on its stopped clock (`document.getAnimations()` is never empty there; "animation finished" is the recorder's `busy()`). |
| `Hold` | Optional, for video: how long the shot stays on the end state after `Wait for` is met, in page time. Default 0: the video ends on the frame the condition becomes true. |
| `Capture` | `screenshot`, `frames at <offsets>`, or `video`, then the filename. `{ms}` in a filename is replaced by the offset. |
| `Join` | Optional, for video: the shot continues the previous scene's video instead of starting its own file. `cut`, or `crossfade` and a duration (`crossfade 400 ms`). |

A **scene** is a starting state plus what's shot from it. Hover, open, and typing are actions inside a scene, not scenes of their own, and a stage scene can be used by several script scenes.

A **variant** is the same shot with one setting changed: the theme, a resolution, a text. Or with several, when it comes from a version saved in the stage's panel: the scene writes every setting the version changes, and its suffix is the name the user gave the version. Each variant is a scene of its own, with the override written out and the value as a suffix of both the scene's name and the filename (`Opening, light`, `command-bar-opening-light.mp4`). The scene that keeps the Stage value gets the suffix too, so every variant's file says which one it is. Never a shorthand that expands into several scenes: `/sequence-take` shoots the blocks as written.

**Joined scenes.** Several shots in one video: a tour of two picker scenes, or the same interaction in both themes, without a hard cut between them. Each shot is still a scene of its own, with its picker scene, reset, actions and wait. Every scene after the first has `Join`, and all of them are consecutive and name the same file, so they share its Resolution and extension.

```md
## Scene: Tour, empty
- Picker scene: Empty
- Reset to: replay (R)
- Action: click "New item"
- Wait for: the new row is visible
- Hold: 600 ms
- Capture: video, list-tour.mp4

## Scene: Tour, many items
- Picker scene: Many items
- Reset to: replay (R)
- Action: hover the third row
- Wait for: the row's actions are visible
- Hold: 1 s
- Join: crossfade 400 ms
- Capture: video, list-tour.mp4
```

`cut` starts the shot on the frame after the previous one ends. `crossfade` dissolves one into the other over the duration, and the video is that much shorter than the shots end to end. The incoming shot starts that long before its first action, on its still starting state, and the fade covers the last frames of the outgoing one. When its first action is a replay (R), there's no still starting state to lead in on: the frames before the replay show the scene before it remounts, and the replay would jump back right after the fade. So that shot starts on the first frame the remounted scene draws, and the fade covers its own first frames. So the outgoing scene's `Hold` is at least the duration, or its last motion fades out under the dissolve. A crossfade is an edit, not the component's motion. When a real interaction leads from one state to the next, that's one scene with several actions, not a join. A variant of a joined video is a variant of every scene in it.

**Notes.** Anything inferred rather than said by the user, and every known limitation. `/sequence-take` repeats them in its handoff.
