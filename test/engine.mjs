import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.argv[2], browser = await chromium.launch();
const engine = JSON.parse(await readFile(new URL("./fixtures/bundle/engine.json", import.meta.url)));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + "/engine/"); await page.locator('#main[aria-busy="false"]').waitFor();
  const nodes = page.locator(".schematic-node"); assert.equal(await nodes.count(), engine.nodes.length);
  await nodes.first().focus();
  for (const [i, entry] of engine.nodes.entries()) {
    assert.equal(await nodes.nth(i).evaluate((el) => document.activeElement === el), true, entry.id);
    assert.equal(await page.locator("#engine-panel h2").textContent(), entry.name);
    assert.equal(await page.locator("#engine-panel a").getAttribute("href"), entry.href);
    if (i < engine.nodes.length - 1) await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.press("Home"); assert.equal(await nodes.first().getAttribute("aria-pressed"), "true");
  await page.keyboard.press("End"); assert.equal(await nodes.last().getAttribute("aria-pressed"), "true");
  const noJS = await browser.newPage({ javaScriptEnabled: false });
  await noJS.goto(base + "/engine/");
  assert.deepEqual(await noJS.locator("#engine-list li").evaluateAll((list) => list.map((node) => node.dataset.nodeList)), engine.nodes.map((n) => n.id));
  await noJS.close();
  await page.route("**/data/manifest.json", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.goto(base + "/engine/"); await page.locator('#main[aria-busy="false"]').waitFor();
  assert.match(await page.locator("#data-status").textContent(), /Results not published yet/);
  assert.equal(await page.locator(".schematic-node").count(), 12);
  console.log("Engine: JSON-driven pipeline order, every node panel/link, keyboard traversal, no-JS list and unpublished default passed.");
} finally { await browser.close(); }
