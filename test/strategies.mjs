import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.argv[2], browser = await chromium.launch();
const strategies = JSON.parse(await readFile(new URL("./fixtures/bundle/strategies.json", import.meta.url)));
const daily = JSON.parse(await readFile(new URL("./fixtures/bundle/runs/orx-synthetic-v1/equity.json", import.meta.url)));
try {
  const page = await browser.newPage();
  await page.goto(base + "/strategies/"); await page.locator('#main[aria-busy="false"]').waitFor();
  for (const strategy of strategies) {
    const card = page.locator(`[data-strategy="${strategy.id}"]`);
    assert.equal(await card.getAttribute("data-state"), strategy.state);
    if (strategy.retired_reason) assert.ok((await card.textContent()).includes(strategy.retired_reason));
  }
  const requests = []; page.on("request", (r) => requests.push(r.url()));
  await page.goto(base + "/strategies/nq-rev/"); await page.locator('#main[aria-busy="false"]').waitFor();
  assert.equal(await page.locator("#strategy-results").isHidden(), true);
  assert.equal(await page.locator("#strategy-results .stat-strip").count(), 0);
  assert.equal(requests.some((url) => url.includes("/data/runs/")), false, "In-build strategies must not request performance data");
  await page.goto(base + "/strategies/orx/"); await page.locator('#main[aria-busy="false"]').waitFor();
  const sorted = [...daily].sort((a, b) => a.net_r - b.net_r);
  for (const [label, day] of [["best", sorted.at(-1)], ["worst", sorted[0]], ["median", sorted[Math.floor(sorted.length / 2)]]]) {
    const link = page.locator(`[data-session-choice="${label}"] a`).filter({ hasText: "Replay this session" });
    const target = new URL(await link.getAttribute("href"), base);
    assert.equal(target.searchParams.get("day"), day.date); assert.equal(target.searchParams.get("run"), "orx-synthetic-v1");
  }
  assert.match(await page.locator("#strategy-forward").textContent(), /strategy-specific forward series has not been exported/i);
  const noJS = await browser.newPage({ javaScriptEnabled: false });
  await noJS.goto(base + "/strategies/"); assert.equal(await noJS.locator("tbody tr").count(), 6);
  await noJS.goto(base + "/strategies/sweep/"); assert.match(await noJS.locator("#strategy-theory").textContent(), /Retired.*insufficient evidence/s);
  await noJS.close();
  console.log("Strategies: all exported states, retired reasons, theory-only data isolation, ranked replay links, separate forward limits and no-JS descriptions passed.");
} finally { await browser.close(); }
