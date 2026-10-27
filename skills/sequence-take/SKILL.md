---
name: sequence-take
description: Run a script.md on an isolated component's stage, driving the real UI with Playwright and saving the screenshots, frame sequences, and videos it asks for, cropped to the stage frame. Every frame is rendered on a stopped JavaScript clock, so videos have a true 60 fps at any resolution, on any OS. Run after /sequence-script.
argument-hint: "[component] [script path]"
disable-model-invocation: true
---

# Taking a Capture

The third of three steps: `/sequence-isolate` builds the stage, `/sequence-script` decides what to shoot, `/sequence-take` shoots it. It reads `script.md`, drives the stage in a browser, and saves files. The user judges the results; this skill doesn't.

Nothing is recorded in real time, so a slow machine or a high density never drops a frame. An init script stops the page's clocks, and every Web Animation is paused and seeked to that clock. Each frame is stepped 1/60 s, rendered and screenshotted before the next one starts: a slow machine makes the take longer, never the video. It needs no begin-frame control, which Chromium doesn't support on macOS, so it runs wherever Playwright's Chromium runs.

## Hard rules

1. **The stage and the component are read-only.** No edits to the component, the stage, or the project config, and no instrumentation of your own. Reach every state through real interactions and the stage's own controls. If one can't be reached, report it. The clock script is the recorder's, injected by Playwright: it changes no file, and nothing else is injected.
2. **The script is the direction.** Shoot exactly its scenes, in its order, with its filenames, read per [script-format.md](references/script-format.md). If something ambiguous would change the result, ask one question. Otherwise take the most conservative reading and note it. Never rewrite the script.
3. **The frame is the crop.** Every file holds exactly `.stage-frame`: no matte, no picker, no panel (see "Cropping").
4. **No quality pass.** Don't inspect, compare, or grade the outputs. Report what was produced, never that it looks right.
5. **Captures are never committed and never overwritten.** They're excluded from git before the first one is written. If a filename already exists, add `-2`, `-3` and say so.

## Workflow

### Phase 1: Recon

- **Script.** The path from the arguments, otherwise `script.md` in the stage directory (the paths in the `# isolate:<component>:begin` block of `git rev-parse --git-path info/exclude`). No stage: stop, `/sequence-isolate` comes first. No script: suggest `/sequence-script`, or ask for the direction in one message.
- **Stage.** The URL, the picker's scenes, the panel, the keys ([CONTROLS.md](../sequence-isolate/CONTROLS.md)). The port comes from the project's running dev server, found by folder as in `/sequence-isolate`'s Phase 5. If none is running, ask the user to start it. Never start one yourself.
- **Component** (or the stage's snapshot). The locators the script's actions need, and the animation mechanism behind each animated scene. Note any time source the clock doesn't cover (see "What the clock covers"): a scene that depends on one is a named limitation.
- **Tooling.** Playwright drives the stage: the project's own if it has one, otherwise `playwright-core` in the scratchpad, as in `/sequence-isolate`'s Phase 5. Pick the `playwright-core` version whose Chromium is already in Playwright's browser cache, so nothing is downloaded. Any Chromium works, headless shell or not. Every capture goes through [scripts/recorder.mjs](scripts/recorder.mjs), imported by absolute path from this skill's real directory (resolve the `~/.claude/skills` symlink with `realpath`). It needs `ffmpeg`: on the `PATH` first, otherwise `ffmpeg-static` in the sequence repo, at `node_modules/ffmpeg-static/ffmpeg` two levels above that real directory. If neither exists, ask to run the repo's `install.sh`, which installs `ffmpeg-static`. Install nothing without asking.

**Completion criterion:** every scene maps to concrete steps with the tools at hand, or to a named limitation.

### Phase 2: Set up

1. **Exclude first.** Before writing any capture, add the output directory to the same exclude file, in its own block:

   ```
   # take:command-bar:begin
   artifacts/captures/command-bar/
   # take:command-bar:end
   ```

   `/sequence-isolate done` removes only `isolate:` blocks, so the captures outlive the stage.
2. **Launch** Chromium headless, and a context with `deviceScaleFactor: d` (*d* from "Cropping").
3. **Install the clock before opening the stage.** `await context.addInitScript(clockScript)` before `newPage()`. It must run before the page's own scripts: libraries such as motion capture `requestAnimationFrame` when they load, and the stage's speed clock wraps whatever is there when it installs. Until a take starts the clock follows real time, so loading, the panel, and Playwright's locators work as usual.
4. **Open the stage** with a window just larger than the frame: the frame preset's CSS px plus 40 px on each side, so a 16:9 · 1280×720 frame opens at 1360×800. With the frame on `Auto`, the viewport is the frame. If the stage shows "window too small", the capture would be the wrong size: enlarge the window, don't shoot.
5. **Set the panel** to the script's Stage values through DialKit, then press `H` for clean mode. Clean mode unmounts the panel, so a scene that overrides a setting leaves clean mode with `H`, changes it, and re-enters. Keys keep working in clean mode, so scenes can be switched with `1–9` without showing the picker.

### Phase 3: Shoot

For each scene, in order: switch to its picker scene, apply its reset (`R` remounts the scene so entrance animations run again), park the pointer where its path starts, and wait in real time until no finite animation is running. Then read the crop, start a take, perform its actions with real input, wait for its condition, stop the take, capture.

#### Driving frames

`const take = await record(page, { dir, crop })` stops the page's clock: from here its time moves only when the take renders a frame. `dir` is a new directory in the scratchpad, never in the captures (it refuses one that isn't empty). `crop` is `await page.locator('.stage-frame').boundingBox()`, read right before: frames are screenshotted already cropped. Frame 0 is the picture at that moment.

| Call | Does |
| --- | --- |
| `take.move(page.mouse, x, y)` | moves the pointer and renders exactly one frame |
| `take.act(promise)` | any other input (`page.mouse.down()`, `page.keyboard.type('a')`, `page.keyboard.press('Enter')`); its handlers run at once, on the stopped clock, and no frame is rendered |
| `take.wait(ms)` | renders `ms` of page time, rounded to whole frames |
| `take.until(() => page.evaluate(...))` | renders frame by frame until the condition is true |
| `take.busy()` | true while a finite animation hasn't reached its end |
| `take.time` | page time since frame 0, in ms |
| `take.stop()` | ends the take; the page's clock follows real time again |

- **Only these move time.** Inside a take, never call a Playwright method that waits for the page to change (`locator.click()`, `waitForSelector`, `waitForFunction`, `waitForTimeout`, `expect`): the page's time doesn't move while it waits, so it hangs or measures nothing. Read state with `page.evaluate()` or `locator.boundingBox()`, and act with raw `page.mouse` and `page.keyboard` through `take.move` and `take.act`.
- **Waits** are `take.until` on an observable condition. When the condition is an animation finishing, include `!(await take.busy())`, never `document.getAnimations()` play states: during a take every animation is paused, because the clock seeks it. `take.wait` is only for holds and frames at timed offsets.
- **The first action.** `const from = take.time` right before it: the video starts there.
- **Pointer motion.** With a drawn pointer (`Arrow` or `Dot`), the path is on camera. Move like a hand: curved, eased paths, one `take.move` per frame (ease in and out, slight overshoot or arc), short `take.wait` pauses before clicks, never straight fixed-step lines or teleports. Draw the randomness from a seeded generator, so a re-take moves the same way. Without a drawn pointer, only the endpoints matter.
- **Speed.** The stage's speed clock sits on top of this clock, so it works unchanged: a 0.25× scene takes four times the frames. Anything `/sequence-isolate`'s handoff or the script's Notes say ignores the multiplier runs at 1×: shoot it and report it. Don't substitute a different output form.
- **Real time is irrelevant.** A take of 14 s of video can take a minute to render. Don't shorten waits or holds to save time.

#### What the clock covers

`performance.now`, `Date.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `document.timeline` and every Web Animation (CSS animations, CSS transitions, `element.animate()`). That covers CSS, motion and most JavaScript animation. Not covered, and running in real time: `<video>` and `<audio>`, canvas or WebGL drawn on a clock of their own, workers, and `MessageChannel` tasks (they run as soon as they can, which is right for framework renders). A scene that depends on one of these is a named limitation: report it, don't patch around it.

### Cropping

- **Resolution.** Every file has exactly the script's Resolution px (script-format.md, "Output"). Its density *d* is resolution ÷ the frame preset's CSS px, and may be fractional: a 1:1 · 800×800 frame at 1080p is *d* = 1.35. If the density written in the script disagrees, the px win: use the computed *d* and say so. The frame preset stays as set; only *d* changes. A scene that changes *d* gets its own context.
- **All three forms come from a take.** `size` is the Resolution in px. `encode` and `still` refuse to upscale or overwrite: if they refuse to upscale, *d* was set lower than the Resolution needs, open a new context at the right one; on a name clash, pick the `-2` name yourself.
- **Screenshot.** A take that reaches the scene's condition, then `await take.still({ output, at: take.time, size, ffmpeg })` after `stop()`: the last frame, as PNG.
- **Frames.** One take through the action, long enough to pass the last offset; then one `take.still` per offset with `at: from + offset`. The offsets are exact to the frame (1/60 s), from the moment the action fires.
- **Video.** The file holds exactly `.stage-frame`, starts at the scene's first action, and has the script's Resolution, with the component filling the frame and no padding, letterbox, or empty band. `await take.encode({ output, from, size, ffmpeg })` after `stop()` trims to `from`, scales, and encodes to the extension in one pass. Every rendered frame is an output frame at 60 fps; `.gif` takes every other one for 30 fps.
- **Frame format.** PNG.
- **Video format.** The extension picks the encoding, as the table in script-format.md says. `encode()` holds that table, so never pass codec flags. Without `ffmpeg` (the user declined to install it), there's no file: say so and leave the raw frames in the scratchpad.
- **Video check.** Before handing off, read each video's real pixel size, which must equal the Resolution, and look at one frame from it: the component fills the frame and nothing else shows.
- If the recorder fails on a scene, or the tooling can't produce the form the script asks for, stop on that scene and ask.

### Phase 4: Hand off

- each file saved, with its path, pixel size, and frame count
- the scenes and actions performed
- what couldn't be done, and why, including any time source the clock doesn't cover
- every assumption or deviation from the script, plus the script's Notes
- known limits: an animation that starts between two frames is timed from the next one (up to one frame early); looping animations restart at the take's first frame; a re-take of the same scene gives the same frames as long as the scene uses only the clocks above, except a hover that Chromium applies on its own after a layout shift under a still pointer (an element sliding under it), which can land a frame apart between takes, and a level of difference in a few pixels from rasterization; the timing of everything on the clock is exact
- that the captures are git-excluded under their directory, the stage is still running, and `/sequence-isolate done` removes it
