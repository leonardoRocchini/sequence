---
name: sequence-script
description: Interview the user one question at a time and turn what they want to capture from an isolated component into a script.md that /sequence-take executes. Run after /sequence-isolate.
argument-hint: "[component]"
disable-model-invocation: true
---

# Directing a Capture

The second of three steps: `/sequence-isolate` builds the stage, `/sequence-script` decides what to shoot, `/sequence-take` shoots it. This skill only writes `script.md`. It doesn't touch the component or the stage, and it doesn't capture anything.

## Hard rules

1. **One question per message.** Each question settles one decision that changes the script. Choose the next question from the answer, not from a fixed list.
2. **Read before asking.** Scenes, interactions, animation timing, and stage settings are in the code. Ask the user about intent, never about facts the repo already holds.
3. **Nothing invented.** Every scene, interaction, and animation in the script exists in the component or on the stage. Keep what the user said apart from what you inferred.
4. **The format belongs to `/sequence-take`.** Write the script in the shape of [script-format.md](../sequence-take/references/script-format.md), so the writer and the reader agree.
5. **No file before approval.** Propose the plan, get a yes, then write.

## Workflow

### Phase 1: Recon

Find the stage from the `# isolate:<component>:begin` block in the exclude file (`git rev-parse --git-path info/exclude`). If there's none, stop and say `/sequence-isolate` comes first. Then read:

- **The stage.** The picker's scenes, the panel's options, the keys ([CONTROLS.md](../sequence-isolate/CONTROLS.md)), and the editable text paths per scene (the fixtures' `editable` export, CONTROLS.md "Content").
- **The component** (or the stage's snapshot of it). Interactive elements and their handlers, CSS transitions and animations, motion libraries, and their durations. Motion that may escape the speed multiplier (CONTROLS.md, "What can escape it") goes in Notes as Inferred, so `/sequence-take` reports it: nothing else records it.
- **The tooling.** `/sequence-take` makes every capture (screenshot, frames, video) with its `recorder.mjs`, which needs `ffmpeg` (on the `PATH`, or `ffmpeg-static` from the sequence repo's `install.sh`). Without it, there's no capture of any kind: say so before the interview.
- **An existing `script.md`.** If there is one, the interview edits it instead of starting over.
- **The stage's state.** `stage-state.json` in the stage directory: the panel's settings, its saved versions, the current scene, and the edited text, saved by the stage on every change ([CONTROLS.md](../sequence-isolate/CONTROLS.md), "Stage state"). Note its modification time. A stage on a host with no server route has a "Copy for script" action instead and no file: then the state is the JSON the user pasted with the command or in the conversation, if any. A stage older than this contract has neither.

**Completion criterion:** you could list each scene's real states and interactions without asking the user.

### Phase 2: Interview

Open with one sentence on what you found. If there's a stage state, the first question shows it and asks whether to start from it: a compact summary (scene, theme, frame, background, scale, speed, pointer, the versions as one line each, the edited text as path and new text), with how old the file is, then "Start from these settings, or override them?" Starting from them puts them in Confirmed. Overriding drops them, and the interview asks as if there were none; the user can also override only part ("all but the background"). With no file and a stage that has "Copy for script", the first question asks for it instead: "If you set up the stage already, press Copy for script in the panel and paste it here. Otherwise we start from the stage's defaults." The user can skip it. Then ask the most consequential open decision. The usual order, adapted to context:

1. Purpose: a still for reference, an interaction walkthrough, an animation study.
2. Which scenes, in what order, and what happens in each.
3. Variants: whether some scenes are shot again with one setting changed, usually the theme ("both the opening and the three stills in Light and Dark?"). Ask once the scenes are known, offering the stage's own theme options, and settle which scenes get which variants. Each variant becomes its own scene (script-format.md, "Scene"). Saved versions in the stage state are variants the user already prepared: offer them first ("the opening in V1 and V2?"). Compare the versions with each other, never with `stage`: `stage` holds whichever version is loaded in the panel, so one version always matches it, and that one is still a variant. Only two versions with identical settings collapse into one. A version differs from the Stage values in several settings at once, so its scene writes every setting that differs. A version still named `V1`, `V2`, … gets a short name from the user, which becomes the scene's and the file's suffix (`Opening, dark social`, `command-bar-opening-dark-social.mp4`): `v1` says nothing about the file. A name the user gave in the panel is the suffix as it is.
4. For animation: video or frames at offsets, full speed or slowed. For video, whether it holds on the end state, and how long (script-format.md, `Hold`). For video, the format too (script-format.md, "Output"), taken from where the video ends up: social or portfolio is `.mp4`, a web page `.webm`, a README `.gif`, editing `.mov`. Ask only if the destination is unknown, and offer `.mp4` first.
5. Framing the stage doesn't already settle: frame preset, theme (the Stage default, when variants don't already cover it), background (a token, or Custom and a hex), scale, pointer. A visible pointer in an automated capture needs the stage's drawn pointer (`Arrow` or `Dot`). If the stage predates it, say so and offer to rebuild with `/sequence-isolate`.
6. Resolution, as its own question after the frame: the frame picks the aspect ratio and the composition (its px are CSS px, the layout space), the resolution picks the file's pixels. Offer the tiers for that frame's aspect with their px and density, plus the integer densities and a custom size. For a 1:1 · 800×800 frame: 720p · 720×720 px (0.9×), 1080p · 1080×1080 px (1.35×), 1440p (2K) · 1440×1440 px (1.8×), 1× · 800×800 px, 2× · 1600×1600 px. Mark the integer densities as crisp. When the user picks a fractional one, say once what it costs (1 px borders and small icons render soft, script-format.md "Output") and offer the nearest integer density. If they keep the fractional one, it goes in Notes. Pick the tier from the destination when the user named one (a social post, a retina screenshot for docs). A size with a different aspect ratio than the frame isn't an option: if the user wants that ratio, change the frame instead. With Frame `Auto` there are no tiers or densities: ask for a size in px, which becomes the viewport at 1×.
7. Text, only if the user brings it up or the purpose calls for a variant (the same shot with a long title): the edited text comes from the stage state, and new text is the user's to give. A text variant overrides the path in the scene with `Content:` (script-format.md, "Scene"), not in the Content section.
8. Filenames and directory, only if the defaults won't do.

Offer 2–4 concrete options drawn from the code. A free answer is always allowed.

> Weak: "What interactions do you want?"
> Better: "The menu opens on click and its items can be selected. Should the capture show only the opening, or the selection too?"
>
> Weak: "How long should I wait?"
> Better: "The menu opens with a 180 ms transition. Record it at full speed, or at 0.25× so the motion reads?"

Keep a ledger: **Confirmed** (the user said it, the existing script has it, or the user started from the stage state), **Inferred** (supported by the code), **Open**. Ask only about Open.

The stage state settles the stage settings, the variants, and the text, so questions 5 and much of 3 usually don't come up. Two exceptions. Speed: the panel's speed is often the one the user explored with, not the one they want to shoot at, so a speed other than 1×, in the state or in a version, goes into question 4 as the proposed answer ("You were watching it at 0.25×. Record at 0.25×?"), not straight into Confirmed. Stale entries: a content path that isn't in the stage's `editable` list for that scene, a scene name the picker doesn't have, or an option the panel no longer offers. Drop them and say so, don't write them. The state's scene is a hint for which scene matters, not a decision about the shot list.

If the user says "you decide", pick the conservative option and mark it Inferred. If an interaction can't be automated with the available tooling, say so before asking about an alternative.

**Completion criterion:** every scene has a picker scene, a starting point, its actions, a capture type, and a filename, so `/sequence-take` could run it without guessing. Stop asking then. If the user stops earlier, write from Confirmed items only and list the rest under Notes.

### Phase 3: Propose

Show the plan compactly: purpose, scenes in order with their actions and captures, stage settings, the variants as one line per shot rather than one per scene (`Opening → video · Dark, Light`), with the count of files they make, the edited text per picker scene (path and new text, one line each), the frame and the resolution as two lines (`Frame: 1:1 · 800×800 CSS px`, `Resolution: 1080p · 1080×1080 px (1.35×)`), outputs, and Notes (inferences and limitations). Ask one question: approve, or change something?

### Phase 4: Write

Write `script.md` into the stage directory. The stage's exclude block already covers it, so it's never committed, and `done` deletes it with the stage. If the user wants to keep the script past `done`, write it where they say instead.

Hand off with the path, one line per scene and its output, the Notes, and the next step: `/sequence-take <component>`.
