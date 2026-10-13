---
name: sequence-take
description: Run a script.md on an isolated component's stage, driving the real UI with browser tooling and saving the screenshots, frame sequences, and videos it asks for, cropped to the stage frame. Run after /sequence-script.
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
- **Tooling.** The browser automation available (a browser MCP, the project's Playwright) and whether it can screenshot an element, set the viewport and pixel density, and record video. Check for `ffmpeg`. Install nothing without asking.

**Completion criterion:** every scene maps to concrete steps with the tools at hand, or to a named limitation.

### Phase 2: Set up

1. **Exclude first.** Before writing any capture, add the output directory to the same exclude file, in its own block:

   ```
   # take:command-bar:begin
   artifacts/captures/command-bar/
   # take:command-bar:end
   ```

   `/sequence-isolate done` removes only `isolate:` blocks, so the captures outlive the stage.
2. **Open the stage** with a window larger than the frame. If the stage shows "window too small", the capture would be the wrong size: enlarge the window, don't shoot.
3. **Set the panel** to the script's Stage values through DialKit, then press `H` for clean mode. Clean mode unmounts the panel, so a scene that overrides a setting leaves clean mode with `H`, changes it, and re-enters. Keys keep working in clean mode, so scenes can be switched with `1–9` without showing the picker.

### Phase 3: Shoot

For each scene, in order: switch to its picker scene, apply its reset (`R` remounts the scene so entrance animations run again), perform its actions with real input, wait for its condition, capture.

- **Waits** are observable conditions. Fixed delays are only for frames at timed offsets.
- **Pointer motion.** With a drawn pointer (`Arrow` or `Dot`), the path is on camera. Move like a hand: curved, eased paths in small steps (ease in and out, slight overshoot or arc), short pauses before clicks, never straight fixed-step lines or teleports. Without one, only the endpoints matter.
- **Speed.** The stage slows Web Animations and JS clocks. Anything `/sequence-isolate`'s handoff or the script's Notes say ignores the multiplier runs at real speed: shoot it at real timing and report it. Don't substitute a different output form.

### Cropping

- **Screenshot.** Screenshot the `.stage-frame` element, not the page. With the frame on `Auto`, the viewport is the frame. Use the script's pixel density (default 2×), so a 1280×720 frame gives a 2560×1440 file.
- **Frames.** The same element screenshot, taken at each offset from the moment the action fires.
- **Video.** Recorders capture the whole viewport from the start of the session. Make the viewport the frame: set it to the preset's px and switch the frame to `Auto`, which gives the same pixels with no matte. If the viewport can't be set, crop to `.stage-frame`'s bounding box afterwards with `ffmpeg`. Then trim the setup: note when the scene's first action fires and cut everything before it. Without `ffmpeg`, deliver the uncropped or untrimmed file and say which.
- **Video size.** Pixel density doesn't reach video. Playwright records in CSS px whatever `deviceScaleFactor` is, and pads a smaller recording into the top-left corner of `recordVideo.size`, so a 2× size gives the component in the top-left quarter of a gray video. Always set `recordVideo.size` equal to the viewport and `deviceScaleFactor` to 1, in a new context for each viewport size, because the size is fixed when the context is created. For a video at density *d*, multiply the viewport by *d* and the stage's Scale by *d*: a 1280×720 frame at 2× is a 2560×1440 viewport, frame `Auto`, Scale 2×. That's the same composition, rendered at twice the pixels, not upscaled. If Scale × *d* isn't one of the panel's options, record at 1× and say so. Before handing off, check each video's size with `ffprobe` and look at one frame from it: the component fills the frame and no gray band shows.
- If the tooling can't produce the form the script asks for, stop on that scene and ask.

### Phase 4: Hand off

- each file saved, with its path and pixel size
- the scenes and actions performed
- what couldn't be done, and why
- every assumption or deviation from the script, plus the script's Notes
- that the captures are git-excluded under their directory, the stage is still running, and `/sequence-isolate done` removes it
