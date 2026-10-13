// Drawn pointer: the stage paints its own, so captures show one.
const ARROW = `<svg class="stage-pointer-arrow" width="17" height="23" viewBox="0 0 17 23"><path d="M1 1v17.5l4.6-4.4 3 7.2 3-1.3-3-7H15z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const IBEAM_PATH = "M1 1.5c2 0 3.5.5 3.5 2v13c0 1.5-1.5 2-3.5 2M8 1.5c-2 0-3.5.5-3.5 2v13c0 1.5 1.5 2 3.5 2M2.5 10h4";
const IBEAM = `<svg class="stage-pointer-text" width="9" height="20" viewBox="0 0 9 20" fill="none" stroke-linecap="round"><path d="${IBEAM_PATH}" stroke="#fff" stroke-width="3"/><path d="${IBEAM_PATH}" stroke="#000" stroke-width="1.25"/></svg>`;

export function installPointer(root: HTMLElement, style: "arrow" | "dot") {
  const el = document.createElement("div");
  el.className = "stage-pointer";
  el.dataset.style = style; // "arrow" | "dot"
  el.dataset.kind = "arrow";
  el.setAttribute("aria-hidden", "true");
  el.toggleAttribute("data-hidden", true);
  el.innerHTML = ARROW + IBEAM + `<span class="stage-pointer-dot"></span>`;
  document.body.append(el);

  const html = document.documentElement;
  html.setAttribute("data-stage-pointer", "");

  function kindOf(target: Element) {
    // `cursor: none` hides the component's own cursor; lift it for one read.
    const hidden = root.getAttribute("data-cursor");
    html.removeAttribute("data-stage-pointer");
    root.removeAttribute("data-cursor");
    const cursor = getComputedStyle(target).cursor;
    html.setAttribute("data-stage-pointer", "");
    if (hidden !== null) root.setAttribute("data-cursor", hidden);
    if (cursor === "text" || (cursor === "auto" && target.closest("input, textarea, [contenteditable]"))) return "text";
    if (cursor === "pointer") return "link";
    return "arrow";
  }

  function onMove(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const outside = !target || target.closest(".stage-panel, .dialkit-root, .stage-picker");
    el.toggleAttribute("data-hidden", Boolean(outside));
    if (outside) return;
    const scale = parseFloat(getComputedStyle(root).getPropertyValue("--stage-scale")) || 1;
    el.style.transform = `translate(${event.clientX}px, ${event.clientY}px) scale(${scale})`;
    el.dataset.kind = kindOf(target);
  }
  const onDown = () => el.toggleAttribute("data-pressed", true);
  const onUp = () => el.toggleAttribute("data-pressed", false);
  const onLeave = (event: PointerEvent) => { if (!event.relatedTarget) el.toggleAttribute("data-hidden", true); };

  document.addEventListener("pointermove", onMove, true);
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointerup", onUp, true);
  document.addEventListener("pointerout", onLeave, true);

  return function uninstallPointer() {
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointerout", onLeave, true);
    html.removeAttribute("data-stage-pointer");
    el.remove();
  };
}
