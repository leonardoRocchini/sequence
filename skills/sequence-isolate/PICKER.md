# The Scene Picker

The picker switches scenes. The tabs are scenes, and it **never touches the URL**. Its appearance is **not a design decision**. Copy the markup and wiring below verbatim; the CSS comes from `templates/stage.css`. The only values that change per run are the scene names and count. Don't restyle it with the project's tokens, fonts, or colors.

It is a floating dark pill, bottom-center. Dark glass works on top of any page, light or dark, which is why it isn't theme-aware.

## Markup

The sliding highlight span first, then one tab per scene, a hairline divider, and the replay button:

```html
<nav class="stage-picker" aria-label="Scenes">
  <span class="stage-picker-highlight" aria-hidden="true"></span>
  <button class="stage-picker-item" data-active aria-current="true">Default</button>
  <button class="stage-picker-item">Empty</button>
  <button class="stage-picker-item">Many items</button>
  <span class="stage-picker-divider" aria-hidden="true"></span>
  <button class="stage-picker-item stage-picker-replay" aria-label="Replay (R)">↻</button>
</nav>
```

In a framework, keep the class names and structure. Only the rendering syntax changes. Render it through a portal to `body` so the scale wrapper never affects it.

It's a `nav` of buttons with `aria-current`, not a `tablist`: there's no tabpanel to point at, and the replay button would be a non-tab child of the list.

## Styles

The styles are in the "Scene picker" section of [templates/stage.css](templates/stage.css), copied with the stage (STAGE.md). Don't retype or restyle them.

## Rules

- **Verbatim.** These values are the spec. No project fonts, no brand colors, no theme switching, no extra shadows or borders.
- **The highlight slides; the scene swap stays instant.** The highlight animates between tabs as feedback on the picker itself. The scene being shown switches with no transition. The speed multiplier never slows the picker (see [CONTROLS.md](CONTROLS.md)).
- **One allowed modification.** If the component occupies the bottom-center of the frame (a toast, a dock, a bottom sheet), set `data-position="top"`.
- **One scene, no picker.** With a single scene, leave the picker out. Replay stays on `R`.

## Behavior contract

- Clicking a tab or pressing `1–9`, `←`, or `→` switches scene. `R` and the ↻ button remount the current scene without switching.
- Exactly one tab carries `data-active` and `aria-current="true"`, and the highlight slides to it.
- The URL never changes. The current scene is saved to `localStorage` under `isolate:<component>:scene` (wrapped in try/catch, falling back to the first scene), so a reload brings it back. The highlight takes its initial position without animating (`data-ready` is set after first paint).
- Switching remounts the component (a new key), so entrance animations run again.

## Reference wiring

Use this verbatim for a plain-HTML stage (host 3 in SKILL.md, Phase 4, or a host 2 page without a UI framework). In a framework, keep the same behavior but express it idiomatically: state instead of `innerHTML`, a keyed remount instead of `requestAnimationFrame`, and refs plus a layout effect for measuring the highlight. It includes the stage's one keyboard listener (CONTROLS.md, "Keys"). With a single scene the picker isn't rendered, and the same code runs without it.

```js
// `scenes` is an array of render functions, one per scene, in picker order.
const SCENE_KEY = 'isolate:<component>:scene';
const frame = document.querySelector('.stage-scale');
const picker = document.querySelector('.stage-picker'); // null with a single scene
const highlight = picker?.querySelector('.stage-picker-highlight');
const tabs = picker ? [...picker.querySelectorAll('.stage-picker-item:not(.stage-picker-replay)')] : [];
const replay = picker?.querySelector('.stage-picker-replay');
let current = 0;

function moveHighlight() {
  const el = tabs[current];
  if (!el) return;
  highlight.style.width = el.offsetWidth + 'px';
  highlight.style.transform = `translateX(${el.offsetLeft}px)`;
}

function mount(i) {
  frame.innerHTML = '';
  // Clear first, render next frame, so entrance animations re-run.
  requestAnimationFrame(() => { frame.innerHTML = scenes[i](); });
}

function setScene(i) {
  if (i < 0 || i >= scenes.length) return;
  current = i;
  tabs.forEach((el, j) => {
    el.toggleAttribute('data-active', j === i);
    if (j === i) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
  });
  moveHighlight();
  try { localStorage.setItem(SCENE_KEY, String(i)); } catch {}
  mount(i);
}

function toggleClean() {
  const clean = document.documentElement.toggleAttribute('data-stage-clean');
  // The plain panel is removed from view, not faded (CONTROLS.md, "Clean mode removes it").
  const panel = document.querySelector('.stage-panel');
  if (panel) panel.style.display = clean ? 'none' : '';
}

tabs.forEach((el, i) => el.addEventListener('click', () => setScene(i)));
replay?.addEventListener('click', () => mount(current));
window.addEventListener('resize', moveHighlight);

document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= Math.min(scenes.length, 9)) setScene(num - 1);
  else if (e.key === 'ArrowRight') setScene((current + 1) % scenes.length);
  else if (e.key === 'ArrowLeft') setScene((current - 1 + scenes.length) % scenes.length);
  else if (e.key === 'r' || e.key === 'R') mount(current);
  else if (e.key === 'h' || e.key === 'H') toggleClean();
});

let saved = 0;
try { saved = Number(localStorage.getItem(SCENE_KEY)) || 0; } catch {}
setScene(saved < scenes.length ? saved : 0);
// Enable the slide only after first paint, so load doesn't animate.
if (picker) requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));
```
