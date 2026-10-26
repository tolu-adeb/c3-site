import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
const base = process.argv[2], browser = await chromium.launch();
const fixture = JSON.parse(await readFile(new URL("./fixtures/bundle/runs/orx-synthetic-v1/sessions/2026-07-30.json", import.meta.url)));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  await page.goto(base + "/replay/?run=orx-synthetic-v1&day=2026-07-30");
  await page.locator("#replay-workspace:not([hidden])").waitFor();
  const slider = page.locator("#replay-position");
  assert.equal(await slider.inputValue(), "77");
  assert.equal(await page.locator("#replay-readout").getAttribute("aria-live"), "polite");
  await slider.focus(); await page.keyboard.press("Home");
  assert.equal(await slider.inputValue(), "0");
  assert.equal(await page.locator("#decision-log li").count(), 0);
  assert.equal(await page.locator(".trade-path").count(), 0);
  await page.keyboard.press("ArrowRight"); assert.equal(await slider.inputValue(), "1");
  await page.keyboard.press("ArrowLeft"); assert.equal(await slider.inputValue(), "0");
  await page.keyboard.press("s"); assert.equal(await slider.inputValue(), "6");
  assert.match(await page.locator("#score-card").textContent(), /threshold 60/);
  assert.equal(await page.locator("#score-card tbody tr").count(), 12);
  await slider.focus(); await page.keyboard.press("Home");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  assert.match(await page.locator("#score-card").textContent(), /Fail/);
  await page.keyboard.press("End");
  const geometry = await page.locator("#replay-chart").evaluate((el) => {
    const path = el.querySelector(".trade-path"), entry = el.querySelector('.candle[data-time="1785418200"]'), exit = el.querySelector('.candle[data-time="1785419700"]');
    const rect = exit.querySelector("rect");
    const svg = el.querySelector("svg"), width = svg.viewBox.baseVal.width, actual = svg.getBoundingClientRect().width;
    return { scale: actual / width, entryX: Number(entry.dataset.x), pathEntryX: Number(path.dataset.entryX), exitX: Number(exit.dataset.x), pathExitX: Number(path.dataset.exitX), closeY: Number(exit.dataset.closeY), pathExitY: Number(path.dataset.exitY), bodyY: Number(rect.getAttribute("y")) };
  });
  assert.ok(Math.abs(geometry.entryX - geometry.pathEntryX) * geometry.scale <= 1, "Entry aligns within one pixel");
  assert.ok(Math.abs(geometry.exitX - geometry.pathExitX) * geometry.scale <= 1, "Exit time aligns within one pixel");
  assert.ok(Math.abs(geometry.closeY - geometry.pathExitY) * geometry.scale <= 1, "Exit price aligns within one pixel");
  assert.equal(fixture.trades[0].exit, fixture.bars[11][4]);
  await slider.focus(); await page.keyboard.press("Home"); await page.keyboard.press("Space");
  assert.equal(await slider.inputValue(), "77", "Reduced-motion playback jumps to the final frame");
  assert.equal(await page.locator("#replay-play").getAttribute("aria-pressed"), "false");
  await page.locator("#next-session").click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("day") === "2026-07-31");
  assert.match(await page.locator("#session-context").textContent(), /2026-07-31/);
  await page.goBack();
  await page.waitForFunction(() => document.querySelector("#session-context").textContent.includes("2026-07-30"));
  await page.locator("#random-session").click();
  await page.waitForFunction(() => document.querySelector("#replay-chart .candle"));
  await page.screenshot({ path: "test/artifacts/replay-desktop.png", fullPage: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(base + "/replay/?run=orx-synthetic-v1&day=2026-07-30");
  await page.locator("#replay-workspace:not([hidden])").waitFor();
  await page.locator("#replay-play").click();
  await page.waitForFunction(() => Number(document.querySelector("#replay-position").value) > 0);
  await page.locator("#replay-play").click();
  assert.equal(await page.locator("#replay-play").getAttribute("aria-pressed"), "false");
  // Capture real animation-frame scrubbing rather than a tight synchronous loop.
  const timing = await page.evaluate(async () => {
    const slider = document.querySelector("#replay-position"), frames = [], durations = [];
    let previous;
    for (let i = 0; i < 78; i++) {
      const stamp = await new Promise(requestAnimationFrame);
      if (previous !== undefined) frames.push(stamp - previous);
      previous = stamp;
      const start = performance.now(); slider.value = i; slider.dispatchEvent(new Event("input", { bubbles: true })); durations.push(performance.now() - start);
    }
    return { frames, durations };
  });
  const sorted = [...timing.frames].sort((a, b) => a - b), fps = 1000 / sorted[Math.floor(sorted.length / 2)];
  const render = [...timing.durations].sort((a, b) => a - b), p95 = render[Math.floor(render.length * .95)];
  assert.ok(fps >= 58, `Replay frame cadence ${fps.toFixed(1)} fps is below 60 Hz with timing tolerance`);
  assert.ok(p95 < 16.7, `Replay p95 update ${p95.toFixed(2)} ms exceeds one 60 Hz frame`);
  await writeFile("test/artifacts/replay-timing.json", JSON.stringify({ fps, p95, ...timing }, null, 2));
  await context.tracing.stop({ path: "test/artifacts/replay-trace.zip" });
  const noJS = await browser.newPage({ javaScriptEnabled: false });
  await noJS.goto(base + "/replay/"); assert.match(await noJS.locator("noscript").textContent(), /needs JavaScript/);
  await noJS.locator("noscript a").click();
  assert.equal(await noJS.locator("#static-trades tbody tr").count(), 15);
  console.log(`Replay: keyboard, decisions, gates, day navigation, no-JS message, reduced motion and pixel alignment passed; ${fps.toFixed(1)} fps, p95 update ${p95.toFixed(2)} ms. Trace saved.`);
} finally { await browser.close(); }
