import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.argv[2], browser = await chromium.launch();
let checked = 0;
try {
  const page = await browser.newPage();
  const response = await page.goto(base + "/methodology/"); assert.equal(response.status(), 200);
  const ids = await page.locator("[id]").evaluateAll((nodes) => nodes.map((n) => n.id));
  assert.equal(new Set(ids).size, ids.length, "Methodology IDs must be unique");
  const required = ["data", "fixtures", "proxy", "samples", "costs", "walk-forward", "holdout", "random-walk", "paper", "parity", "engine", "limits", "glossary"];
  required.forEach((id) => assert.ok(ids.includes(id), id));
  function check(href, context) {
    const url = new URL(href, base);
    assert.equal(url.origin, new URL(base).origin, context);
    assert.equal(url.pathname, "/methodology/", `${context}: source must lead to Methodology`);
    assert.ok(url.hash.length > 1 && ids.includes(decodeURIComponent(url.hash.slice(1))), `${context}: missing anchor ${href}`); checked++;
  }
  async function crawl(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await crawl(path);
      else if (entry.name.endsWith(".html")) {
        const html = await readFile(path, "utf8");
        const links = await page.evaluate((html) => [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("a.source")].map((a) => a.getAttribute("href")), html);
        links.forEach((href) => check(href, path.pathname));
      } else if (entry.name.endsWith(".js")) {
        const js = await readFile(path, "utf8");
        for (const match of js.matchAll(/\/methodology\/#[-a-z0-9]+/g)) check(match[0], path.pathname);
      }
    }
  }
  await crawl(new URL("../public/", import.meta.url)); await crawl(new URL("../src/", import.meta.url));
  for (const file of ["../public/assets/engine.json", "./fixtures/bundle/engine.json"]) {
    const graph = JSON.parse(await readFile(new URL(file, import.meta.url)));
    graph.nodes.forEach((n) => check(n.href, n.id));
  }
  const routes = ["/backtests/", "/replay/", "/strategies/", ...["orx", "orb", "sweep", "vwap", "nq-rev", "nq-cont"].map((id) => `/strategies/${id}/`), "/engine/", "/track-record/", "/styleguide/"];
  for (const route of routes) {
    await page.goto(base + route);
    if (/^\/(strategies|engine|track-record)\//.test(route)) await page.locator('#main[aria-busy="false"]').waitFor();
    if (route === "/backtests/") await page.locator("#explorer:not([hidden])").waitFor();
    if (route === "/replay/") await page.locator("#replay-workspace:not([hidden])").waitFor();
    for (const host of await page.locator("[data-chart]").all()) {
      await host.scrollIntoViewIfNeeded(); await host.locator("svg").waitFor();
    }
    for (const host of await page.locator('#explorer [id$="-chart"]').all()) {
      await host.scrollIntoViewIfNeeded(); await host.locator("figure").waitFor();
    }
    if (route.startsWith("/strategies/")) {
      for (const host of await page.locator('#strategy-results:not([hidden]) :is(#strategy-equity,#strategy-drawdown,#strategy-histogram,#strategy-segments), [data-session-choice] > div').all()) {
        await host.scrollIntoViewIfNeeded();
        if (await host.locator("figure").count() === 0) await host.locator("figure").waitFor();
      }
    }
    const links = await page.locator("a.source").evaluateAll((nodes) => nodes.map((n) => n.href));
    assert.ok(links.length, `${route}: expected source chips`); links.forEach((href) => check(href, route));
  }
  assert.ok(checked >= 100, `Expected a broad source crawl, got ${checked}`);
  const noJS = await browser.newPage({ javaScriptEnabled: false });
  await noJS.goto(base + "/methodology/");
  assert.match(await noJS.locator("#paper").textContent(), /signed paper snapshot/);
  assert.match(await noJS.locator("#limits").textContent(), /hypothetical results do not guarantee/);
  assert.match(await noJS.locator("#proxy").evaluate((el) => el.parentElement.textContent), /unverified project note/);
  assert.equal(await noJS.locator("#glossary dt").count(), 9);
  await noJS.close();
  console.log(`Methodology: ${checked} static/rendered source and engine destinations resolve; required sections and no-JS content passed.`);
} finally { await browser.close(); }
