# The Stage

The stage is what the component stands on: a full-viewport root, a capture frame of exact size, and a scale wrapper. Like the picker and the panel, it is **not a design decision**. Copy the markup verbatim and the CSS from `templates/stage.css`. The only things that change per run are, in the CSS copy, the stage root's z-index and the dev-overlay selectors, and, in the markup, the `Original` background token in `--stage-bg`. The stage uses no project fonts or colors beyond that background.

## Anatomy

- **Stage root.** Fills the viewport and sits above the app shell. Its fill is a fixed neutral **matte** that marks the area outside the frame.
- **Frame.** A box of exact pixel size, centered, painted with the chosen project background. **The frame is the crop target.** The user captures exactly the frame, so its size is shown in the panel. `Auto` drops the frame and the whole viewport becomes the canvas.
- **Scale wrapper.** Scales the component (1x, 1.5x, 2x) so small components fill a recording crisply.
- **Pointer** (optional). A pointer the stage draws itself, so automated captures show one ("Pointer" below). Off unless the panel's Pointer is `Arrow` or `Dot`.

Frame presets, fixed:

| Key | Size | For |
| --- | --- | --- |
| `auto` | viewport | quick shots |
| `16x9` | 1280×720 | video, changelog |
| `4x3` | 1024×768 | docs |
| `1x1` | 800×800 | social |
| `4x5` | 864×1080 | social portrait |
| `9x16` | 450×800 | stories, mobile |

## Markup

```html
<div class="stage-root" data-frame="16x9" style="--stage-bg: var(--background); --stage-scale: 1">
  <div class="stage-frame">
    <div class="stage-scale"><!-- fixture providers + component --></div>
  </div>
</div>
```

## Styles

[templates/stage.css](templates/stage.css) holds the stage, the drawn pointer, and the picker styles. Copy it into the stage directory with `cp`, don't retype it. Then make the only two per-run edits in the copy: the `.stage-root` z-index from recon, and the dev-overlay selectors under the clean-mode rule.

It covers: the full-viewport `.stage-root` with its `#1f1f1f` matte, the exact-size `.stage-frame` painted with `--stage-bg`, the `.stage-scale` zoom wrapper, `data-cursor="hidden"`, the `.stage-warning` shown on the matte when the frame doesn't fit, clean mode (`html[data-stage-clean]` hides the picker and the warning), and `html[data-stage]` hiding page scroll.

## Pointer

The system pointer is never in a capture. Browser recorders and element screenshots only see what the page paints, and Playwright sends synthetic input that never moves the real pointer, so even a screen recording shows it parked. The drawn pointer is part of the page, so every capture form includes it, manual recordings too.

It's optional and off by default: the panel's Pointer select (CONTROLS.md) installs it only on `Arrow` or `Dot`. It is stage chrome, like the matte. It reads the component's cursor and never changes the component.

- **Exact.** It sits on the latest pointer event's coordinates with no smoothing, so it never trails the component's hover states. Natural motion is the input's job (`/sequence-take` moves along eased paths), not the pointer's.
- **Shape from the component.** Under the pointer, the component's computed `cursor` picks the shape: `text` (and `auto` over an input, textarea, or contenteditable) draws the I-beam, `pointer` the link shape, everything else the arrow. While the pointer is drawn, `data-stage-pointer` on `html` hides the system pointer everywhere except the picker and the panel, portals included, so there's never a second pointer. Since that also hides the component's own cursor, the reader lifts the attribute for one synchronous style read and puts it back before anything paints.
- **Styles.** `Arrow` is a macOS-style arrow and I-beam. Over a link it stays an arrow, since a drawn hand reads as clip art at capture sizes. `Dot` is an iPadOS-style dot that grows over links and becomes a bar over text.
- **Press.** `pointerdown` shrinks it slightly until `pointerup`, so clicks read on camera.
- **Scale.** It follows `--stage-scale`, so it keeps its size relative to the zoomed component.
- **Speed.** It's excluded from the speed clock, because it follows real input, which isn't slowed.
- **Clean mode keeps it.** It's part of the shot, not the chrome. It hides over the picker and the panel, where the system pointer shows, and when the pointer leaves the window.

### Markup and styles

The pointer is appended to `body`, above the component's portals (popovers, toasts) and just below the picker and the panel:

```html
<div class="stage-pointer" data-style="arrow" data-hidden aria-hidden="true"></div>
```

Its styles are in the "Drawn pointer" section of [templates/stage.css](templates/stage.css).

### Script

The script is [templates/pointer.ts](templates/pointer.ts) (`installPointer(root, style)` returns its uninstall function). Copy it with `cp`, don't retype it.

The shape is read on `pointermove`. When a component swaps the element under a still pointer (a row that becomes a form), the shape updates on the next move.

## Escaping the shell

This applies to host 1 in SKILL.md, Phase 4 (a route inside an app). A Vite page or a static file (hosts 2 and 3) renders without the shell, so there's nothing to escape. Pick the first option that works without editing production files:

1. **A route outside the shell.** The router lets a route skip the app layout (a top-level route in React Router or TanStack Router, a Next.js route group that already has its own root layout). Put the stage there. The stage root's fixed overlay then has nothing to cover.
2. **Cover the shell.** The root layout wraps every route (a Next.js App Router root layout with a sidebar). The stage renders inside it, and the fixed stage root covers the shell. Its z-index must be above everything the shell positions and below the layer the component's portals use, or the component's popovers open underneath the stage. The `40` in `templates/stage.css` assumes Tailwind-style `z-50` overlays. Set it from recon. If the shell fetches data to render, the stage inherits that dependency. Say so in the handoff.

Never move or edit the app's layout files to make room for the stage.

## Theme

Apply the project's dark mechanism to `.stage-root` when its selectors match any element (a `.dark { … }` block or a `&:is(.dark *)` variant). If they're anchored to `html` or `:root`, toggle it on `document.documentElement` instead, and restore the original value when the stage unmounts. Portals render outside the stage root, so if the component portals, the theme has to go on `html`. A project with a single theme has nothing to toggle: leave this out, with the panel's Theme control (CONTROLS.md).

## Behavior contract

- **Frame size.** Set `--stage-w`/`--stage-h` from the preset. If the frame doesn't fit the viewport, don't shrink it: render `<p class="stage-warning">1280 × 720 · window too small</p>`. A shrunken frame would silently capture at the wrong size.
- **Mount.** Mount the component only after `document.fonts.ready` resolves (once) and the speed clock from [CONTROLS.md](CONTROLS.md) is installed. Scene switches and replay change the component's key, so it remounts and its entrance animations run again.
- **Mount flags.** On mount, set `data-stage` on `html`. On unmount, remove `data-stage` and `data-stage-clean`, restore the theme, and uninstall the clock and the pointer.
