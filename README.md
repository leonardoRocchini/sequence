# sequence

[![skills.sh](https://skills.sh/b/leonardoRocchini/sequence)](https://skills.sh/leonardoRocchini/sequence)

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

- **A git repository** with a project the stage can live in: an app with file-based routes (Next.js, TanStack Router, React Router, SvelteKit, Nuxt), a Vite dev server, or a static site. You run the dev server; the skills never start one.
- **Node.js**, for Playwright and the recorder.
- **Chromium**: the one in Playwright's browser cache, or Google Chrome if it's installed. With neither, `sequence-take` asks to run `npx playwright install chromium`, the only install that stays behind.
- **`lsof`**, to find the dev server by folder. macOS has it; on Linux, install it.
- **Python 3**, for a static site only: its stage is served with `python3 -m http.server`.

Everything else is installed when needed and removed afterwards, without asking: `playwright-core` and, without ffmpeg on the `PATH`, `ffmpeg-static` go in a scratch directory, never in the project. In a React project the stage adds DialKit and `motion` to it, and `done` removes them.

Tested on macOS with Next.js, Vite, TanStack Router, React Router in a pnpm monorepo, SvelteKit with yarn, bun and a static site. Linux should work; Windows is untested.

## License

[MIT](LICENSE)
