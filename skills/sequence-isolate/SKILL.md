---
name: sequence-isolate
description: Build a throwaway, dev-only page that renders one component alone, centered in a fixed-size frame, with curated fixture content, a scene picker, and a control panel that vanishes on a key, so the component can be screenshotted or screen-recorded cleanly. `done` deletes it.
argument-hint: "<component> [scenes: a, b, c] | add scene <name> | done [<component>]"
disable-model-invocation: true
---

# Isolating a Component

A capture skill. It takes one component, mounts it alone in the middle of an empty page — no sidebar, no neighbors, no dev overlays — fills it with content chosen to look good on camera, and hands the user one fixed URL, with every scene on a tab picker, that they can screenshot or record. When they're done, it deletes itself.

It doesn't take the screenshots, explore design directions, or fix the component. If the component looks wrong on stage, that's a finding to report, not something to patch here.

## Hard rules

1. **Never touch production code.** That includes one-word edits: no added `export`, no new prop, no test ID. The stage lives in its own throwaway directory and page, imported by nothing. The component is rendered exactly as it ships. If it can't be reached or rendered without an edit, follow "Reaching the component" in Phase 2. If that fails too, stop and ask.
2. **Real materials, curated content.** Real fonts, tokens, and components, so the capture shows the actual product. The content is the opposite of a prototype's worst case: realistic, well-proportioned, consistent. No lorem ipsum, no "Test 123", no real personal data, no 80-character name that wraps.
3. **Only the component.** Nothing else from the app shows up in the frame. The shell is hidden or covered, and dev overlays (framework indicators, query devtools, inspectors) disappear in clean mode.
4. **Deterministic.** The same scene and settings always produce the same pixels. No network, no `Date.now()`, no random IDs or avatars, no remote images that can fail. Fonts are loaded before the component mounts, so a recording never opens on a font swap.
5. **The chrome follows the spec.** The stage and frame come from [STAGE.md](STAGE.md), the scene picker from [PICKER.md](PICKER.md), and the DialKit control panel and speed clock from [CONTROLS.md](CONTROLS.md). Copy the stage and the picker verbatim and don't restyle them. In clean mode the picker and the panel are gone entirely, not faded.
6. **Dev-only, fails closed, throwaway, uncommittable.** The stage is never reachable in production: a route gated on the environment 404s there, and a page outside the build's inputs is never built (Phase 4, "Host"). Every path the stage creates is listed in `.git/info/exclude` before it's written, so a forgotten stage can't be committed. `done` deletes everything, even from a new session.

## Workflow

### Phase 1: Scope

One component per run. Restate it in one sentence, then list the **states** to capture as named scenes ("Default", "Empty", "Loading", "Many items"). If the user didn't name any, propose 2–4 from the component's real states and continue. Interactions such as hover, open, drag, or typing are not scenes. The user performs them live during the recording, so the scene only has to start from the right place.

### Phase 2: Recon

Read the component file yourself: the fixtures must match its props and data types exactly. Hand everything else below to one `Explore` subagent (medium breadth), so the files it reads never enter this context. Give it the component's path and ask for a compact report, every finding with its `file:line` and no file dumps: each input and where it comes from (with query keys and the shape of the data they return), which host the stage fits, the shell and how to escape it, the shell's highest z-index and the portal z-index, the dark-mode mechanism and where its selectors are anchored, two or three candidate background tokens, and the dev-overlay selectors. Open a file yourself only when the report leaves a specific gap.

The report covers:

- **Inputs.** Props, contexts, stores, data hooks and the query keys they read, URL state, and any `Date`/random/network use.
- **Host.** Which of the three hosts in Phase 4 fits: the router and how routes are declared, the dev server (Vite or other) and its root, or for a static site its input and output directories. In a monorepo where the component lives in a package, whether an app in the repo already renders that package. Whether the framework has server routes in development (a Next.js route handler, a SvelteKit `+server`, a Nuxt server route, a resource route with an action), which decides how the stage state reaches `/sequence-script` (CONTROLS.md, "Stage state").
- **Shell.** What wraps every route (layouts, sidebars, providers that fetch). Decide how the stage escapes it (STAGE.md, "Escaping the shell"). Find the shell's highest z-index and the z-index the project uses for portals (popovers, toasts).
- **Theme.** How dark mode is applied (a class, a data attribute, a media query) and whether its selectors work on any element or only on `html`.
- **Backgrounds.** Two or three project tokens the component plausibly sits on (page canvas, raised surface). These become the panel's background options.
- **Dev overlays.** The DOM selectors of anything the dev server floats over the page.

**Reaching the component.** If the component isn't exported (an inner piece defined in another component's file), never add an `export`. Try these in order:

1. **Mount the nearest exported ancestor.** Use fixtures to drive it into the state where the piece is on screen, and size the frame around it. You capture the real thing in its real context.
2. **Snapshot the file.** Copy the source file byte for byte into the stage directory. Rewrite only relative imports to the project's aliases, and export from the copy. If the file creates a context or store that the piece reads, the copy has its own separate instance, so provide it from the copy too. It's a frozen copy of today's code, not a rebuild, and `done` deletes it. Say in the handoff that the stage renders a snapshot, so later edits to the original won't show until it's recopied.
3. **Stop and ask** if neither works. Don't rebuild the component by hand, and don't edit the original.

**Completion criterion:** you can list every input the component needs and where each will come from on stage, and the component is reachable without editing a production file.

### Phase 3: Fixtures

Write the scene data in the stage directory, one object per scene:

- Content reads like a real, tidy account. Plausible names and titles, lengths that sit well in the layout, a consistent made-up world (one fictional team, one date range).
- Dates are fixed literals. If the component formats "2 hours ago" from now, freeze the clock for the stage only.
- Images and icons are local files or inline data, never hotlinked.
- Data hooks are fed by **seeding a fresh provider instance** (for example, a new `QueryClient` with `setQueryData` on the exact keys and `staleTime: Infinity`), nested around the component so it never reads the app's live state and never fetches.
- **Editable text.** Next to the scenes, export the paths the panel's Content section may edit, per scene: `export const editable = { Default: ["title", "items[0].title", "user.name"] }`. Only strings the component displays as text. Leave out ids, URLs, dates, enum values, and anything the component parses or compares, because changing them would break its types or its determinism (CONTROLS.md, "Content"). Seeded data that the component reads through a hook can be listed too, as long as the seed is built from the scene's fixture object, so the overrides reach it.

**Completion criterion:** every scene supplies every input from the recon list, and a grep of the stage directory finds no `Date.now()`, argument-less `new Date()`, `Math.random()`, `fetch`, or remote URL outside the stage's own clock freeze and its state save (`_stage/state.ts`, CONTROLS.md "Stage state"; an SVG `xmlns` is fine). Determinism is cheapest to fix here, before the stage is built around the data.

### Phase 4: Build the stage

- **Exclude first.** Save `git status --porcelain` to the scratchpad as the baseline. Then, before writing any file, add the stage's paths to the repo's exclude file (`git rev-parse --git-path info/exclude`, which also resolves correctly inside a worktree). Use one fenced block per component:

  ```
  # isolate:command-bar:begin
  apps/web/src/app/isolate/command-bar/
  # isolate:command-bar:end
  ```

  The block is the manifest `done` deletes from, so list every path the stage creates and nothing else. Prefer one directory: in Next.js, route, fixtures (`_fixtures/`), snapshots, and assets all fit under the route folder. If a tool regenerates a *tracked* file because of the stage (a file-based router's generated route tree), exclude can't hide it. Note that file as a comment in the block (`# regenerated: src/routeTree.gen.ts`) so `done` restores it. A dependency the stage installs is noted the same way (`# dependency: dialkit (apps/web)`, see CONTROLS.md).
- **Host.** Pick the first that fits, and say which in the handoff. The component stays in place; everything the stage needs lives in the excluded directory.
  1. **An app with a router** (Next.js, React Router, TanStack Router, SvelteKit, Nuxt). A dev-only route, `/isolate/<component>` or the framework equivalent, gated on the environment. This includes a component in a monorepo package that an app in the repo already renders: the stage goes in that app.
  2. **A Vite dev server with no router to hook into** (a single-page app, or a library package with its own Vite setup). A separate page in the excluded directory, `isolate/<component>/index.html` under Vite's root, with a module script that mounts the stage. In dev, Vite serves any HTML file under its root at its path (`/isolate/<component>/`) without a config change, and the production build only bundles the entries it's configured with, so the page is never built. There's no shell to escape. The page has none of the app's setup either: import the project's global stylesheet and font setup, and wrap the component in the providers it needs, the same ones the app's entry uses.
  3. **A static site** (plain HTML and CSS, or a generator such as Eleventy). One HTML file in the excluded directory, placed outside every directory the build reads or publishes, linking the project's real stylesheets and fonts by relative path. Module scripts don't run from `file://`, so serve it from the repo root with `python3 -m http.server <port>` (run in the background, nothing installed) rather than the site's own dev server, which would only serve its input directory. Note the server in the exclude block before starting it (`# server: http.server <port>`), so `done` stops it. Use the plain-JS wiring in PICKER.md and plain controls.

  Anything else (a webpack app with no router, a package with no dev server and no app that renders it): stop and ask. Never add a router, a dev server, or a build entry to the project to make room for the stage.
- **Templates.** Copy the fixed chrome in one command, never retype it: `cp <this skill's dir>/templates/{stage.css,clock.ts,pointer.ts,content.ts,state.ts} <stage dir>/_stage/`. In the copy, edit only the `.stage-root` z-index and the dev-overlay selectors (STAGE.md). For a plain-JS stage (host 3, or any stage without a TypeScript build), drop the type annotations.
- **Stage.** Build the root, the frame, and the scale wrapper from [STAGE.md](STAGE.md). Inside them go the fixture providers, then the component, fed with the scene's fixture through `applyContent` (CONTROLS.md, "Content"). The component mounts only after the fonts are ready and the speed clock is installed.
- **Picker.** Build it from [PICKER.md](PICKER.md), one tab per scene from Phase 1. The URL stays fixed: scenes are tabs, never query params.
- **Panel.** Build it from [CONTROLS.md](CONTROLS.md) (DialKit in React, plain controls elsewhere): theme, frame, background (the options from Phase 2, then Custom with its color), scale, speed, pointer (the optional drawn pointer from STAGE.md), and replay. Then the Content panel for the editable paths. Add the stage's keys.
- **State.** Save the stage state to `stage-state.json` through the stage's own dev-only route (CONTROLS.md, "Stage state"). On a host with no server route, skip the route and add the "Copy for script" action to the panel instead. A route outside the stage directory (Nuxt's `server/`) goes in the exclude block before it's written.

**Completion criterion:** every file the stage created is under a path in its exclude block, and `git status --porcelain` matches the baseline except for the tracked files the block names in `# dependency:` and `# regenerated:` notes. `done` deletes only what the block lists, so a file missing from it survives the teardown.

### Phase 5: Hand off

Don't verify the stage in a browser: no check script, no screenshots, no flipping through scenes. The handoff says the stage hasn't been checked.

The stage runs on the project's own dev server, which is the user's to run. Find it by folder, never by port: another project may hold the usual port, and this one may run on any other. List the listeners with `lsof -nP -iTCP -sTCP:LISTEN`, and keep the one whose working directory (`lsof -a -p <pid> -d cwd -Fn`) is the app's directory. Its port goes in the stage URL. If none is running, ask the user to start it (`! npm run dev`, or the project's script), then look again. Never start, restart, or stop a dev server yourself. A second one in the same folder shares its build cache with the user's, and nothing would stop it afterwards: `done` doesn't know about it. The static-site `http.server` (Phase 4) is the only server this skill starts.

Hand off with the single URL (`/isolate/command-bar`), then:

| # | Scene | Notes |
| --- | --- | --- |
| 1 | Default | Press ⌘K live to open |
| 2 | Empty | Starts with no Bookmarks |

Add the frame sizes in px (so a capture tool can be set to them), the keys (`H` hide chrome, `R` replay, `1–9` or `←`/`→` scenes), a reminder that clean mode doesn't show the current speed (so check it before recording), that the Content panel edits the scene's text in place and Reset brings back the fixture's (or, when no scene has editable paths, that there's no Content panel because the text is written in the component's code), that the panel's settings, saved versions, and edited text reach `/sequence-script` on their own through `stage-state.json` (or, with no server route, through "Copy for script", pasted into it), and a line saying the stage is temporary, git-excluded, and removed with `done`. End with the next steps: `/sequence-script <component>` to direct the capture, `/sequence-take <component>` to shoot it, `done` when finished.

**Completion criterion:** the handoff has the URL with the running server's port, every scene, the frame sizes, and the keys.

### Phase 6: Teardown

`done` doesn't rely on this conversation. It works the same from a new session:

1. Read the exclude file and find the `# isolate:<component>:begin/end` blocks. `done <component>` takes that one block. Plain `done` takes all of them, after listing them.
2. Delete every path listed in each block. For each `# dependency:` note, remove the package with the project's package manager in that directory (`pnpm remove dialkit`). For each `# regenerated:` note, rerun the generator once the stage is gone. For each `# server:` note, find the listener on that port (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) and stop it only if its command is `python3 -m http.server <port>`. Anything else on the port isn't the stage's: leave it and say so. Never `git checkout` a tracked file: it may hold the user's own uncommitted changes.
3. Remove the blocks from the exclude file and leave the rest of it untouched. `# take:<component>` blocks belong to `/sequence-take` and hold the user's captures: leave them and their paths alone.
4. Verify. Grep the repo for `stage-root`, `data-stage`, and `/isolate/`, and confirm nothing is left. Run `git status`: nothing should differ from before the run, and the manifest and lockfile changes from a removed dependency must be gone. Excluded files don't appear in `git status`, so the grep is what proves the stage is gone. Run it with `rg --no-ignore` (skipping `node_modules`) or with plain `grep -r`, because ripgrep and tools built on it skip excluded files by default.

If there are no blocks, say so and delete nothing. Never delete a path that isn't in a block. Report what was removed.

## Invocations

| Invocation | Behavior |
| --- | --- |
| `<component>` | Full workflow with proposed scenes |
| `<component> scenes: a, b, c` | Same, with exactly those scenes |
| `add scene <name>` | Add a fixture scene and its tab to the running stage |
| `done` | Teardown of every staged component listed in the exclude file (Phase 6) |
| `done <component>` | Teardown of that component's stage only |
