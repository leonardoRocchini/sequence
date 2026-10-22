---
name: sequence-take-deterministic
description: Run a script.md on an isolated component's stage like /sequence-take, but render every video frame under Chromium's virtual time, so videos have a true 60 fps at any resolution on any machine. Saves screenshots, frame sequences, and videos cropped to the stage frame. Run after /sequence-script.
argument-hint: "[component] [script path]"
disable-model-invocation: true
---

# Taking a Capture, Frame by Frame

The deterministic variant of `/sequence-take`: same script, same stage, same outputs, different clock. `/sequence-take` records a screencast in real time, so a slow machine or a high density drops frames. This skill stops the page's time and advances it 1/60 s per frame: each frame is rendered and screenshotted before the next one starts. A slow machine makes the take longer, never the video. It reads `script.md`, drives the stage in a browser, and saves files. The user judges the results; this skill doesn't.

## Hard rules

1. **The stage and the component are read-only.** No edits to the component, the stage, or the project config, and no instrumentation. Reach every state through real interactions and the stage's own controls. If one can't be reached, report it. Virtual time is the browser's, not the stage's: it changes no file.
2. **The script is the direction.** Shoot exactly its scenes, in its order, with its filenames, read per [script-format.md](../sequence-take/references/script-format.md). If something ambiguous would change the result, ask one question. Otherwise take the most conservative reading and note it. Never rewrite the script.
3. **The frame is the crop.** Every file holds exactly `.stage-frame`: no matte, no picker, no panel (see "Cropping").
4. **No quality pass.** Don't inspect, compare, or grade the outputs. Report what was produced, never that it looks right.
5. **Captures are never committed and never overwritten.** They're excluded from git before the first one is written. If a filename already exists, add `-2`, `-3` and say so.

## Workflow

### Phase 1: Recon

- **Script.** The path from the arguments, otherwise `script.md` in the stage directory (the paths in the `# isolate:<component>:begin` block of `git rev-parse --git-path info/exclude`). No stage: stop, `/sequence-isolate` comes first. No script: suggest `/sequence-script`, or ask for the direction in one message.
- **Stage.** The URL, the picker's scenes, the panel, the keys ([CONTROLS.md](../sequence-isolate/CONTROLS.md)). The port comes from the project's running dev server, found by folder as in `/sequence-isolate`'s Phase 5. If none is running, ask the user to start it. Never start one yourself.
- **Component** (or the stage's snapshot). The locators the script's actions need, and the animation mechanism behind each animated scene.
- **Tooling.** Playwright drives the stage: the project's own if it has one, otherwise `playwright-core` in the scratchpad, as in `/sequence-isolate`'s Phase 5. Every capture goes through [scripts/deterministic-recorder.mjs](scripts/deterministic-recorder.mjs) (see "Driving frames"), imported by absolute path from this skill's real directory (resolve the `~/.claude/skills` symlink with `realpath`). It needs **chrome-headless-shell**, the browser Playwright launches for headless Chromium by default: never `channel: 'chromium'` or a full Chrome, which lack begin-frame control. It needs `ffmpeg`: on the `PATH` first, otherwise `ffmpeg-static` in the sequence repo, at `node_modules/ffmpeg-static/ffmpeg` two levels above that real directory. If neither exists, ask to run the repo's `install.sh`, which installs `ffmpeg-static`. Install nothing without asking.

**Completion criterion:** every scene maps to concrete steps with the tools at hand, or to a named limitation.

### Phase 2: Set up

1. **Exclude first.** Before writing any capture, add the output directory to the same exclude file, in its own block:

   ```
   # take:command-bar:begin
   artifacts/captures/command-bar/
   # take:command-bar:end
   ```

   `/sequence-isolate done` removes only `isolate:` blocks, so the captures outlive the stage.
2. **Launch** Chromium headless with `args: launchArgs(d)` and a context with `deviceScaleFactor: d` (*d* from "Cropping"). The flags hold for the whole browser, so a scene that overrides Resolution gets its own browser.
3. **Attach the driver before opening the stage.** `const driver = await FrameDriver.attach(await context.newCDPSession(page))` right after `newPage()`, before `goto()`. With begin-frame control the page paints only when the driver sends a frame; until a take starts it sends them in real time, so loading, the panel, and Playwright's locators work as usual.
4. **Open the stage** with a window just larger than the frame: the frame preset's CSS px plus 40 px on each side, so a 16:9 · 1280×720 frame opens at 1360×800. Every pixel outside the frame is rendered and screenshotted for nothing. With the frame on `Auto`, the viewport is the frame. If the stage shows "window too small", the capture would be the wrong size: enlarge the window, don't shoot.
5. **Set the panel** to the script's Stage values through DialKit, then press `H` for clean mode. Clean mode unmounts the panel, so a scene that overrides a setting leaves clean mode with `H`, changes it, and re-enters. Keys keep working in clean mode, so scenes can be switched with `1–9` without showing the picker.

### Phase 3: Shoot

For each scene, in order: switch to its picker scene, apply its reset (`R` remounts the scene so entrance animations run again) and park the pointer where its path starts, all in real time. Then start a take, perform its actions with real input, wait for its condition, stop the take, capture.

#### Driving frames

`const take = await driver.record({ dir })` stops the real-time frames: from here the page's time moves only when the take renders a frame. `dir` is a new directory in the scratchpad, never in the captures (it refuses one that isn't empty). Frame 0 is the picture at that moment.

| Call | Does |
| --- | --- |
| `take.move(page.mouse, x, y)` | moves the pointer and renders exactly one frame |
| `take.act(promise)` | any other input or call (`page.mouse.down()`, `page.keyboard.type('a')`, `page.keyboard.press('Enter')`); renders frames only while it waits for one |
| `take.wait(ms)` | renders `ms` of page time, rounded to whole frames |
| `take.until(() => page.evaluate(...))` | renders frame by frame until the condition is true |
| `take.time` | page time since frame 0, in ms |
| `take.stop()` | ends the take; the page gets real-time frames again |

- **Only these move time.** Inside a take, never call a Playwright method that waits for the page to change (`locator.click()`, `waitForSelector`, `waitForFunction`, `waitForTimeout`, `expect`): no frame comes, so it hangs or measures nothing. Read state with `page.evaluate()` or `locator.boundingBox()`, which need no frame, and act with raw `page.mouse` and `page.keyboard` through `take.move` and `take.act`.
- **Waits** are `take.until` on an observable condition. Include "no finite animation still running in the frame" (`document.getAnimations()`) when the condition is an animation finishing. `take.wait` is only for holds and frames at timed offsets.
- **The first action.** `const from = take.time` right before it: the video starts there.
- **Pointer motion.** With a drawn pointer (`Arrow` or `Dot`), the path is on camera. Move like a hand: curved, eased paths, one `take.move` per frame (ease in and out, slight overshoot or arc), short `take.wait` pauses before clicks, never straight fixed-step lines or teleports. Draw the randomness from a seeded generator, so a re-take moves the same way. Without a drawn pointer, only the endpoints matter.
- **Speed.** The stage's speed clock runs on the page's time, so it works unchanged: a 0.25× scene takes four times the frames. Anything `/sequence-isolate`'s handoff or the script's Notes say ignores the multiplier runs at 1×: shoot it and report it. Don't substitute a different output form.
- **Real time is irrelevant.** A take of 8 s of video can take a minute to render. Don't shorten waits or holds to save time.

### Cropping

- **Resolution.** Every file has exactly the script's Resolution px (script-format.md, "Output"). Its density *d* is resolution ÷ the frame preset's CSS px, and may be fractional: a 1:1 · 800×800 frame at 1080p is *d* = 1.35. If the density written in the script disagrees, the px win: use the computed *d* and say so. The frame preset stays as set; only *d* changes.
- **All three forms come from a take.** `crop` is `await page.locator('.stage-frame').boundingBox()` and `size` the Resolution in px. Both methods refuse to upscale or overwrite: if they refuse to upscale, *d* was set lower than the Resolution needs, relaunch at the right one; on a name clash, pick the `-2` name yourself.
- **Screenshot.** A take that reaches the scene's condition, then `await take.still({ output, at: take.time, crop, size, ffmpeg })` after `stop()`: the last frame, as PNG.
- **Frames.** One take through the action, long enough to pass the last offset; then one `take.still` per offset with `at: from + offset`. The offsets are exact to the frame (1/60 s), from the moment the action fires.
- **Video.** The file holds exactly `.stage-frame`, starts at the scene's first action, and has the script's Resolution, with the component filling the frame and no padding, letterbox, or empty band. `await take.encode({ output, from, crop, size, ffmpeg })` after `stop()` crops, trims to `from`, scales, and encodes to the extension in one pass. Every rendered frame is an output frame at 60 fps; `.gif` takes every other one for 30 fps.
- **Frame format.** PNG by default: speed doesn't change the video here, so there's no reason for JPEG.
- **Video format.** The extension picks the encoding, as the table in script-format.md says. `encode()` holds that table, so never pass codec flags. Without `ffmpeg` (the user declined to install it), there's no file: say so and leave the raw frames in the scratchpad.
- **Video check.** Before handing off, read each video's real pixel size, which must equal the Resolution, and look at one frame from it: the component fills the frame and nothing else shows.
- If the recorder fails on a scene, or the tooling can't produce the form the script asks for, stop on that scene and ask.

### Phase 4: Hand off

- each file saved, with its path, pixel size, and frame count
- the scenes and actions performed
- what couldn't be done, and why
- every assumption or deviation from the script, plus the script's Notes
- known limit: a re-take of the same scene can differ by a frame where a wait checks a condition, and by a few levels in some pixels from software rendering; the timing of every animation is exact
- that the captures are git-excluded under their directory, the stage is still running, and `/sequence-isolate done` removes it
