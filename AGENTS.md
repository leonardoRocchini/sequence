# AGENTS.md

This file is the single source of guidance for coding agents working in this repository. `CLAUDE.md` imports it and adds nothing but Claude Code specifics, so put repository facts here and do not maintain a second copy.

## What this repository is

Three agent skills that capture a UI component in isolation, as screenshots, frame sequences and videos, for portfolios, social posts and documentation. They are distributed two ways: via `npx skills add leonardoRocchini/sequence` and as the Claude Code plugin `sequence` served by the marketplace in this same repository. The repository is mostly documentation, with the stage templates under `sequence-isolate/templates/` and the recorder at `sequence-take/scripts/recorder.mjs`. There is no build, lint or test tooling.

`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` define the plugin and its marketplace. Both are named `sequence`, so plugin users invoke skills as `/sequence:sequence-isolate` while skills-CLI users invoke `/sequence-isolate`. Skills are discovered from `skills/` automatically, so adding a skill needs no manifest change. Bump `version` in `plugin.json` in the same commit as any change under `skills/`. `claude plugin update` compares that number and nothing else, so a change shipped without a bump never reaches plugin users. Run `claude plugin validate .` after touching either manifest.

Nothing here tests itself. A change is checked by running the pipeline on a real project: `playground/` in this directory is a Vite app and `../sequence-playground` is a Next.js app, both outside git. After changing `recorder.mjs`, run `node --check` on it, then a `/sequence-take` on a stage.

## Structure

Each skill lives in `skills/<skill-name>/`, with `SKILL.md` as the entry point and supporting files beside it.

- `sequence-isolate` builds a throwaway, dev-only page that mounts one component in a fixed-size frame, with fixture scenes, a scene picker, a control panel and a clean mode (`H`). `STAGE.md`, `PICKER.md` and `CONTROLS.md` specify the stage, the picker and the panel. `templates/` holds the files copied verbatim into every stage: `stage.css`, `clock.ts` (the speed clock), `pointer.ts` and `state.ts` (the state handed to `sequence-script`). `done` deletes the stage.
- `sequence-script` interviews the user and writes the capture's `script.md` into the stage directory. It has no supporting files.
- `sequence-take` runs `script.md` in Chromium through Playwright and saves files cropped to the frame in `artifacts/captures/<component>/`. `references/script-format.md` is the format of `script.md`. `scripts/recorder.mjs` renders every frame on a stopped clock: an init script replaces `performance.now`, `Date.now`, the timers, rAF and `document.timeline`, pauses and seeks every Web Animation, and screenshots one frame at a time. One ffmpeg pass then crops, scales and encodes. It uses no begin-frame control, which Chromium does not support on macOS.

### Shared contracts

The skills run in sequence and hand state to each other through files and keys. Each contract has one owner, and the readers point to it. Change the owner and its readers in the same commit.

| Contract | Owner | Read by |
| --- | --- | --- |
| `# isolate:<component>:begin/end` blocks in `.git/info/exclude`, with their `# dependency:`, `# regenerated:` and `# server:` notes | `sequence-isolate` Phase 4 and Phase 6 | `sequence-script` and `sequence-take`, to find the stage |
| `# take:<component>:begin/end` blocks | `sequence-take` Phase 2 | `sequence-isolate` `done`, which leaves them alone |
| The format of `script.md` | `sequence-take/references/script-format.md` | `sequence-script`, which writes it |
| `stage-state.json` and "Copy for script" | `CONTROLS.md`, "Stage state" | `sequence-script` |
| Finding the dev server by folder, never by port | `sequence-isolate` Phase 5 | `sequence-take` Phase 1 |

The skills link each other's files by relative path (`../sequence-take/references/script-format.md`), so all three must be installed together. After moving or renaming a file, grep `skills/` for `../sequence-` and fix every link.

### Invocation

All three skills are user-invoked: each carries `disable-model-invocation: true` in its frontmatter.

- `sequence-isolate` writes a throwaway page and may add dependencies to the user's project. Only the user knows when a stage is wanted and when it is done.
- `sequence-script` is an interview, so it starts only when the user is there to answer.
- `sequence-take` drives a browser for minutes and writes files the user then judges.

A user-invoked skill cannot invoke another user-invoked skill. So each handoff ends on a `Next:` line naming the command the user types next, and no skill tries to start the following one.

## Authoring conventions

- Everything is in English: the skills, `README.md` and this file.
- Frontmatter has `name` matching the directory, `description`, `argument-hint` and `disable-model-invocation: true`.
- A skill opens with what it is and what it does not do, then numbered **Hard rules**, then a numbered workflow of phases. Every phase ends on a **Completion criterion**.
- Point at a section by its name in quotes (CONTROLS.md, "Stage state") or at a phase by its number within the same skill. Renaming a section means grepping for its old name across `skills/`.
- Handoffs are short. The thing the user wants comes first on its own line, a URL, a path or a directory, then a few lines and the `Next:` line. Each skill's last phase specifies its own.
- A skill never touches production code and never leaves a file that can be committed: everything it creates is listed in `.git/info/exclude` before it is written.
- A skill's line in `README.md` describes the same thing as its `description`. Change both together.
