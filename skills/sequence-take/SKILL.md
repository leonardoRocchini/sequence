---
name: sequence-take
description: Run a script.md on an isolated component's stage, driving the real UI with Playwright and saving the screenshots, frame sequences, and videos it asks for, cropped to the stage frame. Run after /sequence-script.
argument-hint: "[component] [script path]"
disable-model-invocation: true
---

# Taking a Capture

The third of three steps: `/sequence-isolate` builds the stage, `/sequence-script` decides what to shoot, `/sequence-take` shoots it. It reads `script.md`, drives the stage in a browser, and saves files. The user judges the results; this skill doesn't.

## Hard rules

1. **The stage and the component are read-only.** No edits to the component, the stage, or the project config, and no instrumentation. Reach every state through real interactions and the stage's own controls. If one can't be reached, report it.
2. **The script is the direction.** Shoot exactly its scenes, in its order, with its filenames, read per [script-format.md](references/script-format.md). If something ambiguous would change the result, ask one question. Otherwise take the most conservative reading and note it. Never rewrite the script.
3. **The frame is the crop.** Every file holds exactly `.stage-frame`: no matte, no picker, no panel (see "Cropping").
4. **No quality pass.** Don't inspect, compare, or grade the outputs. Report what was produced, never that it looks right.
5. **Captures are never committed and never overwritten.** They're excluded from git before the first one is written. If a filename already exists, add `-2`, `-3` and say so.

## Workflow

### Phase 1: Recon

- **Script.** The path from the arguments, otherwise `script.md` in the stage directory (the paths in the `# isolate:<component>:begin` block of `git rev-parse --git-path info/exclude`). No stage: stop, `/sequence-isolate` comes first. No script: suggest `/sequence-script`, or ask for the direction in one message.
- **Stage.** The URL, the picker's scenes, the panel, the keys ([CONTROLS.md](../sequence-isolate/CONTROLS.md)). The port comes from the project's running dev server, found by folder as in `/sequence-isolate`'s Phase 5. If none is running, ask the user to start it. Never start one yourself.
- **Component** (or the stage's snapshot). The locators the script's actions need, and the animation mechanism behind each animated scene.
- **Tooling.** Playwright runs the script: the project's own if it has one, otherwise `playwright-core` in the scratchpad, as in `/sequence-isolate`'s Phase 5. If the script has a video scene, it's recorded with [scripts/recorder.mjs](scripts/recorder.mjs) (see "Video"), imported by absolute path from this skill's real directory (resolve the `~/.claude/skills` symlink with `realpath`). It needs `ffmpeg`: on the `PATH` first, otherwise `ffmpeg-static` in the sequence repo, at `node_modules/ffmpeg-static/ffmpeg` two levels above that real directory. If neither exists, ask to run the repo's `install.sh`, which installs `ffmpeg-static`. Install nothing without asking.

**Completion criterion:** every scene maps to concrete steps with the tools at hand, or to a named limitation.

### Phase 2: Set up

1. **Exclude first.** Before writing any capture, add the output directory to the same exclude file, in its own block:

   ```
   # take:command-bar:begin
   artifacts/captures/command-bar/
   # take:command-bar:end
   ```

   `/sequence-isolate done` removes only `isolate:` blocks, so the captures outlive the stage.
2. **Open the stage** with a window just larger than the frame: the frame preset's CSS px plus 40 px on each side, so a 16:9 · 1280×720 frame opens at 1360×800. The video screencast renders the whole viewport and crops afterwards, so every pixel outside the frame costs frame rate. With the frame on `Auto`, the viewport is the frame. If the stage shows "window too small", the capture would be the wrong size: enlarge the window, don't shoot.
3. **Set the panel** to the script's Stage values through DialKit, then press `H` for clean mode. Clean mode unmounts the panel, so a scene that overrides a setting leaves clean mode with `H`, changes it, and re-enters. Keys keep working in clean mode, so scenes can be switched with `1–9` without showing the picker.

### Phase 3: Shoot

For each scene, in order: switch to its picker scene, apply its reset (`R` remounts the scene so entrance animations run again), perform its actions with real input, wait for its condition, capture.

- **Waits** are observable conditions. Fixed delays are only for frames at timed offsets.
- **Pointer motion.** With a drawn pointer (`Arrow` or `Dot`), the path is on camera. Move like a hand: curved, eased paths in small steps (ease in and out, slight overshoot or arc), short pauses before clicks, never straight fixed-step lines or teleports. Without one, only the endpoints matter.
- **Speed.** The stage slows Web Animations and JS clocks. Anything `/sequence-isolate`'s handoff or the script's Notes say ignores the multiplier runs at real speed: shoot it at real timing and report it. Don't substitute a different output form.

### Cropping

- **Resolution.** Every file has exactly the script's Resolution (script-format.md, "Output"). Its density *d* is resolution ÷ the frame preset's px, and may be fractional: a 1:1 · 800×800 frame at 1080p is *d* = 1.35. The frame preset stays as set; only *d* changes.
- **Screenshot.** Screenshot the `.stage-frame` element, not the page, with `deviceScaleFactor` = *d* (fractional values work), so a 1:1 · 800×800 frame at 1080p gives a 1080×1080 file. With the frame on `Auto`, the viewport is the frame. If rounding leaves the file a pixel off, resample it to the exact size and say so.
- **Frames.** The same element screenshot, taken at each offset from the moment the action fires.
- **Video.** The file holds exactly `.stage-frame`, starts at the scene's first action, and has the script's Resolution, with the component filling the frame and no padding, letterbox, or empty band. Record with `ScreencastRecorder` from [scripts/recorder.mjs](scripts/recorder.mjs), never Playwright's `recordVideo`, which gives 25 fps VP8 in CSS px:
  1. **Browser.** Launch Chromium **headless** with `args: launchArgs(d)` and give the context `deviceScaleFactor: d` too. The screencast renders at that density, fractional included, at a steady 60 fps. A headed window ignores it and follows the monitor's density and refresh rate. The flag holds for the whole browser, so a scene that overrides Resolution gets its own browser. Screenshots and frames can keep using the same browser.
  2. **Record.** For each video scene, a new recorder on a new directory in the scratchpad, never in the captures (it refuses a directory that isn't empty). `await recorder.start(await context.newCDPSession(page))` once the scene is reset. It returns after the first frame arrives. Call `const from = recorder.mark()` right before the first action, run the actions and the wait, then `await recorder.stop()`.
  3. **Encode.** `await recorder.encode({ output, from, crop: await page.locator('.stage-frame').boundingBox(), size, ffmpeg })`, with `size` the Resolution in px and `ffmpeg` the binary found in Recon. It crops, trims to `from`, scales, and encodes to the extension in one pass, at 60 fps (30 for `.gif`). It refuses to upscale or overwrite: on a name clash, pick the `-2` name yourself.

  If it refuses to upscale, *d* was set lower than the Resolution needs: relaunch at the right one. If the stage can't be recorded this way, stop on that scene and ask.
- **Video format.** The extension picks the encoding, as the table in script-format.md says. `encode()` holds that table, so never pass codec flags. Without `ffmpeg` (the user declined to install it), there's no video: say so and leave the raw frames in the scratchpad.
- **Video check.** Before handing off, read each video's real pixel size, which must equal the Resolution, and look at one frame from it: the component fills the frame and nothing else shows.
- If the tooling can't produce the form the script asks for, stop on that scene and ask.

### Phase 4: Hand off

- each file saved, with its path and pixel size
- the scenes and actions performed
- what couldn't be done, and why
- every assumption or deviation from the script, plus the script's Notes
- that the captures are git-excluded under their directory, the stage is still running, and `/sequence-isolate done` removes it
