# sequence

Agent skills that capture a UI component in isolation, as screenshots, frame sequences and videos, for portfolios, social posts and documentation.

The component renders alone in a fixed-size frame, with real fonts and tokens and curated content, and every frame of a video is rendered on a stopped clock: true 60 fps at any resolution, on any machine. Nothing is added to your production code, and nothing the skills create can be committed.

## Skills

Three steps, each one a slash command:

- [**sequence-isolate**](skills/sequence-isolate/SKILL.md): Builds a throwaway, dev-only page that mounts one component in a fixed frame, with **fixture scenes**, a **scene picker** and a **control panel** for theme, frame, background, scale, speed, pointer and scene text. `H` hides everything but the component. `done` deletes the page.
- [**sequence-script**](skills/sequence-script/SKILL.md): Interviews you one question at a time and writes the capture's `script.md`: which scenes, which interactions, **screenshot, frames or video**, variants, resolution and format. It starts from the settings you left in the stage's panel.
- [**sequence-take**](skills/sequence-take/SKILL.md): Runs `script.md` in Chromium with Playwright and saves the files, **cropped to the frame**, to `artifacts/captures/<component>/`. Videos come out as `.mp4`, `.webm`, `.mov` or `.gif`.

```text
/sequence-isolate command-bar
/sequence-script command-bar
/sequence-take command-bar
/sequence-isolate done command-bar
```

All three are user-invoked: Claude never runs them on its own.

## Install

```bash
npx skills add leonardoRocchini/sequence --skill '*'
```

## Claude Code plugin

```text
/plugin marketplace add leonardoRocchini/sequence
/plugin install sequence@sequence
```

As a plugin, the commands are namespaced: `/sequence:sequence-isolate`, and so on.

## Requirements

- **A project the stage can live in**: an app with a router (Next.js, React Router, TanStack Router, SvelteKit, Nuxt), a Vite dev server, or a static site. You run the dev server; the skills never start one.
- **Node.js**, for Playwright. `sequence-take` uses the project's Playwright if it has one, otherwise installs `playwright-core` in a scratch directory, never in the project.
- **Chromium** from Playwright's browser cache. If there's none, `sequence-take` asks to run `npx playwright install chromium`.
- **ffmpeg**, to encode every capture. If it isn't on the `PATH`, `sequence-take` asks to install `ffmpeg-static` in its scratch directory.

Tested on macOS with Next.js. Linux should work; Windows is untested.

## License

[MIT](LICENSE)
