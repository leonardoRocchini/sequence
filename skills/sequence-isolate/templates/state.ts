// Stage state: what the panel holds, handed to /sequence-script, which can't read the browser.
// Saved to stage-state.json through the stage's dev-only route, or copied when the host has none.
import type { Content } from "./content";

// Panel values as the panel shows them: option labels ("16:9 · 1280×720", "0.25×"), hex for the color.
export type StageValues = {
  theme: string;
  frame: string;
  background: string;
  backgroundColor: string;
  scale: string;
  speed: string;
  pointer: string;
};

export type StageState = {
  component: string;
  scene: string;
  stage: StageValues;
  versions: { name: string; stage: StageValues }[];
  content: Content;
};

let timer: ReturnType<typeof setTimeout> | undefined;
let last = "";

// Debounced, and skipped when nothing changed, so typing in a field writes the file once.
export function saveState(endpoint: string, state: StageState) {
  const body = JSON.stringify(state, null, 2);
  if (body === last) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    last = body;
    fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body }).catch(() => {
      last = "";
    });
  }, 300);
}

// The fallback for hosts with no server route: the same JSON, pasted into /sequence-script.
export async function copyState(state: StageState) {
  const text = JSON.stringify(state, null, 2);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("Copy for script", text);
  }
}
