// Phase 5 check: one pass over every scene in both themes, plus clean mode, speed, and pointer.
// Usage (from a dir where `playwright-core` is installed):
//   node <skill>/scripts/check.mjs <stage url> [out dir]
// Prints a JSON report; writes one PNG per scene and theme plus contact-sheet.png.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { chromium } = createRequire(path.join(process.cwd(), "noop.js"))("playwright-core");

const [url, outArg = "stage-check"] = process.argv.slice(2);
if (!url) throw new Error("usage: node check.mjs <stage url> [out dir]");
const OUT = path.resolve(outArg);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function cachedChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const caches = [path.join(os.homedir(), "Library/Caches/ms-playwright"), path.join(os.homedir(), ".cache/ms-playwright")];
  const builds = [
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-linux64/chrome",
    "chrome-linux/chrome",
  ];
  for (const cache of caches.filter((c) => fs.existsSync(c))) {
    const dirs = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => b.split("-")[1] - a.split("-")[1]);
    for (const dir of dirs) {
      for (const build of builds) {
        const exe = path.join(cache, dir, build);
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return undefined;
}

const report = { url, errors: [], scenes: [], console: [], requests: [], cleanMode: {}, speed: {}, pointer: {}, shots: [] };
// A browser that can't start is the "No browser" fallback in SKILL.md: one line saying why, then exit.
const browser = await chromium.launch({ executablePath: cachedChromium() }).catch((error) => {
  const reason = error.message.split("\n").find((l) => /error while loading|Executable doesn't exist|ENOENT/.test(l)) ?? error.message.split("\n")[0];
  console.error(`Chromium didn't launch: ${reason.replace(/^.*?\]\[err\] /, "").trim()}`);
  process.exit(2);
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await context.newPage();

page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !m.text().startsWith("Failed to load resource")) report.console.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => report.console.push(`pageerror: ${e.message}`));
page.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) report.console.push(`http ${r.status()}: ${r.url()}`); });
let loaded = false;
page.on("request", (r) => {
  const u = new URL(r.url());
  const dev = u.pathname.startsWith("/_next") || u.pathname.includes("__nextjs") || u.pathname.includes("hot-update") || /^\/(@vite|@fs|@id|node_modules\/\.vite)\//.test(u.pathname) || u.protocol === "data:";
  if (loaded && !dev) report.requests.push(`${r.method()} ${r.url()}`);
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector(".stage-frame");
loaded = true;

// Set a panel control: a DialKit select by its label, or a plain <select data-stage-control="<key>">.
// A missing control is reported, not fatal, so one gap doesn't hide the rest of the check.
async function setControl(key, option) {
  try {
    const plain = page.locator(`select[data-stage-control="${key}"]`);
    if (await plain.count()) {
      await plain.selectOption({ label: option }, { timeout: 2000 });
      return true;
    }
    const label = key[0].toUpperCase() + key.slice(1);
    const trigger = page.locator(".dialkit-select-trigger", { has: page.locator(".dialkit-select-label", { hasText: new RegExp(`^${label}$`) }) });
    if (!(await trigger.count())) throw new Error("not on the panel");
    if ((await trigger.locator(".dialkit-select-value").innerText()).trim() === option) return true;
    await trigger.click({ timeout: 2000 });
    await page.getByRole("option", { name: option, exact: true }).click({ timeout: 2000 });
    return true;
  } catch (error) {
    report.errors.push(`panel ${key} → ${option}: ${error.message.split("\n")[0]}`);
    return false;
  }
}

// Wait for entrance animations to settle (at most 3 s).
async function settle() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
    null,
    { timeout: 3000 },
  ).catch(() => {});
  await page.waitForTimeout(150);
}

const tabs = page.locator(".stage-picker-item:not(.stage-picker-replay)");
const sceneNames = (await tabs.count()) ? await tabs.allInnerTexts() : ["Default"];

for (const [i, name] of sceneNames.entries()) {
  if (await tabs.count()) await tabs.nth(i).click();
  const scene = { name, themes: {} };
  for (const theme of ["Light", "Dark"]) {
    await setControl("theme", theme);
    await settle();
    const file = path.join(OUT, `${i + 1}-${name.replace(/\W+/g, "-")}-${theme.toLowerCase()}.png`);
    await page.locator(".stage-frame").screenshot({ path: file });
    report.shots.push(file);
    scene.themes[theme] = await page.evaluate(() => {
      const scale = document.querySelector(".stage-scale");
      const colors = [document.querySelector(".stage-frame"), ...scale.querySelectorAll("*")]
        .slice(0, 50)
        .map((el) => { const cs = getComputedStyle(el); return `${cs.color}|${cs.backgroundColor}`; });
      return { empty: scale.childElementCount === 0, colors: colors.join(";") };
    });
  }
  // Identical colors in both themes mean the theme never reached the component.
  scene.themeChanged = scene.themes.Light.colors !== scene.themes.Dark.colors;
  for (const t of Object.values(scene.themes)) delete t.colors;
  report.scenes.push(scene);
}
await setControl("theme", "Light");
if (await tabs.count()) await tabs.first().click();
await settle();

// Clean mode: nothing but the matte, the frame, and the component.
await page.keyboard.press("h");
await page.waitForTimeout(200);
report.cleanMode = await page.evaluate(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const frame = document.querySelector(".stage-frame");
  const leftovers = [...document.body.querySelectorAll("*")]
    .filter((el) => !el.closest(".stage-root") && !el.matches(".stage-pointer, .stage-pointer *, script, style, link") && visible(el))
    .filter((el) => { const p = getComputedStyle(el).position; return p === "fixed" || p === "absolute" || el.tagName.includes("-"); })
    .map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""));
  return { flag: document.documentElement.hasAttribute("data-stage-clean"), frameVisible: Boolean(frame && visible(frame)), visibleOutsideStage: leftovers.slice(0, 10) };
});
const cleanFile = path.join(OUT, "clean-mode.png");
await page.screenshot({ path: cleanFile });
report.shots.push(cleanFile);
await page.keyboard.press("h");
await page.waitForTimeout(200);

// Speed: at 0.25x, every Web Animation in the component runs at 0.25. JS-clocked motion still needs eyes.
await setControl("speed", "0.25×");
await page.keyboard.press("r");
await page.waitForTimeout(300);
report.speed = await page.evaluate(() => {
  const anims = document.getAnimations().filter((a) => a.effect?.target?.closest?.(".stage-frame"));
  return { animationsInFrame: anims.length, notSlowed: anims.filter((a) => a.playbackRate !== 0.25).map((a) => a.animationName || a.transitionProperty || a.id || "animation") };
});
await setControl("speed", "1×");

// Pointer: Arrow tracks the mouse, turns into an I-beam over text inputs, survives clean mode.
await setControl("pointer", "Arrow");
const box = await page.locator(".stage-frame").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
const pointerState = () => page.evaluate(() => {
  const el = document.querySelector(".stage-pointer");
  return el ? { drawn: !el.hasAttribute("data-hidden"), kind: el.dataset.kind, transform: el.style.transform } : { drawn: false };
});
report.pointer.center = await pointerState();
const input = page.locator(".stage-frame input:visible, .stage-frame textarea:visible").first();
if (await input.count()) {
  const b = await input.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  report.pointer.overInput = await pointerState();
}
await page.keyboard.press("h");
await page.waitForTimeout(200);
report.pointer.inCleanMode = await pointerState();
await page.keyboard.press("h");
await setControl("pointer", "System");

// One contact sheet, so the scenes can be reviewed from a single image.
const tiles = report.shots
  .filter((f) => f !== cleanFile)
  .map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}"><figcaption>${path.basename(f, ".png")}</figcaption></figure>`)
  .join("");
const sheet = await context.newPage();
await sheet.setViewportSize({ width: 1600, height: 900 });
await sheet.setContent(`<style>body{margin:0;padding:12px;background:#111;color:#ddd;font:12px system-ui;display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block;outline:1px solid #333}</style>${tiles}`);
const sheetFile = path.join(OUT, "contact-sheet.png");
await sheet.screenshot({ path: sheetFile, fullPage: true });

await browser.close();
report.contactSheet = sheetFile;
console.log(JSON.stringify(report, null, 2));
