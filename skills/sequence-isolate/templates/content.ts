// Content overrides: text edited in the panel, applied to a scene's fixture before render.
// One localStorage key holds every scene's overrides as { scene: { path: value } }.
// The stage reads it on every mount, so /sequence-take can write it and press R.

export type SceneContent = Record<string, string>;
export type Content = Record<string, SceneContent>;

export const contentKey = (component: string) => `isolate:${component}:content`;

export function readContent(component: string): Content {
  try {
    const parsed = JSON.parse(localStorage.getItem(contentKey(component)) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// `value` null removes the override, so the fixture's own text comes back.
export function writeContent(component: string, scene: string, path: string, value: string | null): Content {
  const all = readContent(component);
  const next = { ...all[scene] };
  if (value === null) delete next[path];
  else next[path] = value;
  if (Object.keys(next).length) all[scene] = next;
  else delete all[scene];
  try { localStorage.setItem(contentKey(component), JSON.stringify(all)); } catch {}
  return all;
}

export function resetContent(component: string, scene: string): Content {
  const all = readContent(component);
  delete all[scene];
  try { localStorage.setItem(contentKey(component), JSON.stringify(all)); } catch {}
  return all;
}

// `items[0].title` -> ["items", "0", "title"]
const keysOf = (path: string) => path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);

// Copies only the objects along the path, so icons and components in the fixture stay as they are.
// Fails when the path doesn't exist or doesn't end on a string.
function setIn(node: unknown, keys: string[], value: string): [unknown, boolean] {
  if (keys.length === 0) return typeof node === "string" ? [value, true] : [node, false];
  if (node === null || typeof node !== "object" || !(keys[0] in node)) return [node, false];
  const [child, ok] = setIn((node as Record<string, unknown>)[keys[0]], keys.slice(1), value);
  if (!ok) return [node, false];
  const copy = Array.isArray(node) ? node.slice() : { ...(node as object) };
  (copy as Record<string, unknown>)[keys[0]] = child;
  return [copy, true];
}

export function getText(fixture: unknown, path: string): string | undefined {
  let node = fixture;
  for (const key of keysOf(path)) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" ? node : undefined;
}

// Returns the fixture with the overrides applied, and reports on `html[data-stage-content]`:
// "ok", or "missing:<paths>" for overrides that no longer match the fixture.
export function applyContent<T>(fixture: T, overrides: SceneContent = {}): T {
  let result: unknown = fixture;
  const missing: string[] = [];
  for (const [path, value] of Object.entries(overrides)) {
    const [next, ok] = setIn(result, keysOf(path), value);
    if (ok) result = next;
    else missing.push(path);
  }
  document.documentElement.dataset.stageContent = missing.length ? `missing:${missing.join(",")}` : "ok";
  return result as T;
}
