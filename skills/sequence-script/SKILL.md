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

- **The stage.** The picker's scenes, the panel's options, the keys ([CONTROLS.md](../sequence-isolate/CONTROLS.md)), and any animations its handoff said ignore the speed multiplier.
- **The component** (or the stage's snapshot of it). Interactive elements and their handlers, CSS transitions and animations, motion libraries, and their durations.
- **The tooling.** `/sequence-take` drives the stage with Playwright. For video, whether the machine has some way to record it. That decides which captures are possible.
- **An existing `script.md`.** If there is one, the interview edits it instead of starting over.

**Completion criterion:** you could list each scene's real states and interactions without asking the user.

### Phase 2: Interview

Open with one sentence on what you found, then ask the most consequential open decision. The usual order, adapted to context:

1. Purpose: a still for reference, an interaction walkthrough, an animation study.
2. Which scenes, in what order, and what happens in each.
3. For animation: video or frames at offsets, full speed or slowed. For video, the format too (script-format.md, "Output"), taken from where the video ends up: social or portfolio is `.mp4`, a web page `.webm`, a README `.gif`, editing `.mov`. Ask only if the destination is unknown, and offer `.mp4` first.
4. Framing the stage doesn't already settle: frame preset, theme, background, scale, pointer. A visible pointer in an automated capture needs the stage's drawn pointer (`Arrow` or `Dot`). If the stage predates it, say so and offer to rebuild with `/sequence-isolate`.
5. Resolution, as its own question after the frame: the frame picks the aspect ratio and the composition, the resolution picks the file's pixels. Offer the tiers for that frame's aspect with their px (for 1:1: 720p · 720×720, 1080p · 1080×1080, 1440p (2K) · 1440×1440), plus density `2×` and a custom size. Pick the tier from the destination when the user named one (a social post, a retina screenshot for docs). A size with a different aspect ratio than the frame isn't an option: if the user wants that ratio, change the frame instead.
6. Filenames and directory, only if the defaults won't do.

Offer 2–4 concrete options drawn from the code. A free answer is always allowed.

> Weak: "What interactions do you want?"
> Better: "The menu opens on click and its items can be selected. Should the capture show only the opening, or the selection too?"
>
> Weak: "How long should I wait?"
> Better: "The menu opens with a 180 ms transition. Record it at full speed, or at 0.25× so the motion reads?"

Keep a ledger: **Confirmed** (the user said it, or the existing script has it), **Inferred** (supported by the code), **Open**. Ask only about Open. If the user says "you decide", pick the conservative option and mark it Inferred. If an interaction can't be automated with the available tooling, say so before asking about an alternative.

**Completion criterion:** every scene has a picker scene, a starting point, its actions, a capture type, and a filename, so `/sequence-take` could run it without guessing. Stop asking then. If the user stops earlier, write from Confirmed items only and list the rest under Notes.

### Phase 3: Propose

Show the plan compactly: purpose, scenes in order with their actions and captures, stage settings, the frame and the resolution as two lines (`Frame: 1:1 · 800×800`, `Resolution: 1080p · 1080×1080`), outputs, and Notes (inferences and limitations). Ask one question: approve, or change something?

### Phase 4: Write

Write `script.md` into the stage directory. The stage's exclude block already covers it, so it's never committed, and `done` deletes it with the stage. If the user wants to keep the script past `done`, write it where they say instead.

Hand off with the path, one line per scene and its output, the Notes, and the next step: `/sequence-take <component>`.
