import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const base = process.argv[2], browser = await chromium.launch();
const trades = JSON.parse(await readFile(new URL("./fixtures/bundle/runs/orx-synthetic-v1/trades.json", import.meta.url)));
const short = trades.filter((t) => t.side === "short");
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + "/backtests/?run=orx-synthetic-v1&side=short");
  await page.locator("#explorer:not([hidden])").waitFor();
  assert.equal(await page.locator('#filters [name="side"]').inputValue(), "short");
  assert.equal(await page.locator("#trade-table tbody tr").count(), 7);
  assert.equal(short.length, 7);
  assert.match(await page.locator("#backtest-stats").textContent(), /7/);
  const net = short.reduce((s, t) => s + t.usd, 0);
  await page.locator("#equity-chart").scrollIntoViewIfNeeded();
  await page.locator("#equity-chart svg").waitFor();
  assert.ok((await page.locator("#equity-chart figcaption").textContent()).includes(Math.abs(net).toLocaleString("en-US", { maximumFractionDigits: 2 })));
  for (const selector of ["#monthly-chart", "#histogram-chart", "#segments-chart", "#comparison-chart"]) {
    await page.locator(selector).scrollIntoViewIfNeeded(); await page.locator(selector + " svg").waitFor();
    assert.match(await page.locator(selector + " .source").textContent(), /orx-synthetic-v1.*sample/);
  }
  await page.locator('[name="from"]').fill("2026-08-03"); await page.locator('[name="from"]').dispatchEvent("change");
  assert.equal(await page.locator("#trade-table tbody tr").count(), short.filter((t) => t.date >= "2026-08-03").length);
  await page.reload(); await page.locator("#explorer:not([hidden])").waitFor();
  assert.equal(await page.locator('[name="from"]').inputValue(), "2026-08-03");
  await page.locator("#trade-sort").selectOption("r-desc");
  const ids = await page.locator("#trade-table tbody tr").evaluateAll((rows) => rows.map((row) => Number(row.dataset.tradeId)));
  assert.deepEqual(ids, short.filter((t) => t.date >= "2026-08-03").sort((a, b) => b.r - a.r).map((t) => t.id));
  await page.locator('#runs input[value="orb-synthetic-v1"]').check();
  await page.waitForFunction(() => document.querySelector("#run-note").textContent.includes("orb-synthetic-v1"));
  assert.equal(await page.locator("#trade-table tbody tr").count(), 15);
  await page.locator("#range-from").focus(); await page.keyboard.press("End");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("from") === "2026-08-12");
  assert.equal(await page.locator("#trade-table tbody tr").count(), 3);
  const noJS = await browser.newPage({ javaScriptEnabled: false });
  await noJS.goto(base + "/backtests/?run=orx-synthetic-v1");
  assert.match(await noJS.locator("#static-summary").textContent(), /orx-synthetic-v1.*15/s);
  assert.match(await noJS.locator("#static-summary").textContent(), /25.4/);
  await noJS.screenshot({ path: "test/artifacts/backtests-no-js.png", fullPage: true });
  await noJS.close();
  await page.route("**/data/manifest.json", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.goto(base + "/backtests/");
  await page.waitForFunction(() => document.querySelector("#data-status").textContent === "Results not published yet.");
  assert.equal(await page.locator("#explorer").isHidden(), true);
  console.log("Backtests: known short count/net, consistent charts, filters, sorting, URL restore, range brush, no-JS public summary and unpublished state passed.");
} finally { await browser.close(); }
