// Browser checks against local Wrangler. Only test tooling uses Playwright and axe.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { themeTokens, contrast } from "./contrast.mjs";

const base = process.argv[2] || "http://127.0.0.1:8787";
const artifacts = resolve(process.env.C3_UI_ARTIFACTS || "test/artifacts");
const baselineCSS = process.env.C3_BASELINE_CSS ? await readFile(process.env.C3_BASELINE_CSS, "utf8") : null;
const axe = await readFile(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const session = JSON.parse(await readFile(new URL("./fixtures/bundle/runs/orx-synthetic-v1/sessions/2026-07-30.json", import.meta.url)));
const widths = [320, 390, 768, 1440];
const routes = [["home", "/"], ["track", "/track-record/"], ["join", "/join/"], ["app", "/app/"], ["404", "/no-such-page/"], ["styleguide", "/styleguide/"], ["backtests", "/backtests/"], ["replay", "/replay/"]];
routes.push(["strategies", "/strategies/"], ...["orx", "orb", "sweep", "vwap", "nq-rev", "nq-cont"].map((id) => [id, `/strategies/${id}/`]));
routes.push(["engine", "/engine/"]);
const errors = [], results = [];
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch();
async function ready(page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => !location.pathname.startsWith("/app/") || !document.querySelector("#lock").hidden);
  if (new URL(page.url()).pathname === "/backtests/") await page.locator("#explorer:not([hidden])").waitFor();
  if (new URL(page.url()).pathname === "/replay/") await page.locator("#replay-workspace:not([hidden])").waitFor();
  if (new URL(page.url()).pathname.startsWith("/strategies/")) await page.locator('#main[aria-busy="false"]').waitFor();
  if (new URL(page.url()).pathname === "/engine/") await page.locator('#main[aria-busy="false"]').waitFor();
}
async function layout(page) {
  return page.evaluate(() => [...document.querySelectorAll("header,main,footer,h1,h2,.story,.step,.figure,form,.tbl,.lock")].map((el) => {
    const r = el.getBoundingClientRect();
    return [el.tagName, ...[r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10)];
  }));
}
async function captureHomeChart(page, filename) {
  await page.locator("#track").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector("#chart").classList.contains("show-5"));
  await page.locator("#chart").screenshot({ path: resolve(artifacts, filename), animations: "disabled" });
}
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ colorScheme: theme, reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    await context.addInitScript((value) => localStorage.setItem("c3.theme", value), theme);
    // Keep screenshots independent of the smoke test's synthetic paper pushes.
    await context.route("**/api/track", (route) => route.fulfill({ json: { public: false } }));
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const intentional404 = new URL(message.location().url || base).pathname === "/no-such-page/" && message.text().includes("404");
      if (!intentional404) consoleErrors.push(message.text());
    });
    for (const width of widths) for (const [name, path] of routes) {
      const label = `${name}-${theme}-${width}`;
      try {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(base + path);
        assert.equal(response.status(), name === "404" ? 404 : 200, label);
        await ready(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: horizontal page scroll`);
        const thirdParties = await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => new URL(r.name).origin !== location.origin).map((r) => r.name));
        assert.deepEqual(thirdParties, [], `${label}: third-party requests`);
        if (name === "styleguide") {
          assert.match(response.headers()["x-robots-tag"], /noindex/);
          assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
          for (const specimen of ["light", "dark"]) {
            const el = page.locator(`.theme-preview[data-theme="${specimen}"]`);
            for (const host of await el.locator("[data-chart]").all()) {
              await host.scrollIntoViewIfNeeded();
              await host.locator("svg").waitFor();
            }
            const tokens = await el.evaluate((node) => Object.fromEntries([...node.querySelectorAll("[data-token-value]")].map((entry) => [entry.dataset.tokenValue, getComputedStyle(node).getPropertyValue(entry.dataset.tokenValue).trim()])));
            const expected = themeTokens(specimen);
            for (const key of Object.keys(tokens)) if (key !== "--hair" && key !== "--gutter") assert.equal(tokens[key], key === "--quick" || key === "--calm" ? "0s" : expected[key], `${label}: ${specimen} ${key}`);
            for (const key of ["--bull", "--bear", "--wire"]) assert.ok(contrast(tokens[key], tokens["--bg"]) >= 3);
            const table = await el.locator("[data-bar]").allTextContents();
            for (const [index, bar] of session.bars.slice(4, 10).entries()) {
              assert.ok(table[index].includes(bar[4].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), `${label}: table close ${index}`);
            }
            for (const selector of [".candle:not(.down) rect", ".candle.down rect"]) {
              const fill = await el.locator(".fig").first().locator(selector).first().evaluate((node) => getComputedStyle(node).fill);
              assert.equal(fill === "none", !selector.includes(".down rect"), `${label}: hollow/filled encoding`);
            }
            for (const link of await el.locator(".source").all()) assert.equal(await link.getAttribute("href"), "#fixture-methodology");
          }
          await page.evaluate(() => scrollTo(0, 0));
        }
        if (name === "backtests") {
          for (const id of ["equity-chart", "drawdown-chart", "monthly-chart", "histogram-chart", "segments-chart", "comparison-chart"]) {
            await page.locator("#" + id).scrollIntoViewIfNeeded(); await page.locator("#" + id + " svg").waitFor();
          }
          await page.evaluate(() => scrollTo(0, 0));
        }
        if (name === "strategies" || ["orx", "orb"].includes(name)) {
          for (const host of await page.locator("#strategy-cards .strategy-card > div,#strategy-equity,#strategy-drawdown,#strategy-histogram,#strategy-segments,#strategy-sessions .session-card > div").all()) {
            await host.scrollIntoViewIfNeeded(); await host.locator("svg").waitFor();
          }
          await page.evaluate(() => scrollTo(0, 0));
        }
        if (width === 320 || width === 1440) {
          await page.evaluate(axe);
          const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })));
          assert.deepEqual(violations, [], `${label}: serious accessibility violations`);
        }
        await page.screenshot({ path: resolve(artifacts, `after-${label}.png`), fullPage: true, animations: "disabled" });
        if (baselineCSS && name !== "styleguide" && (width === 390 || width === 1440)) {
          const after = await layout(page);
          await page.route("**/assets/site.css", (route) => route.fulfill({ body: baselineCSS, contentType: "text/css" }));
          await page.reload();
          await ready(page);
          assert.deepEqual(await layout(page), after, `${label}: existing layout changed`);
          await page.screenshot({ path: resolve(artifacts, `before-${label}.png`), fullPage: true, animations: "disabled" });
          if (name === "home") await captureHomeChart(page, `before-chart-${theme}-${width}.png`);
          await page.unroute("**/assets/site.css");
          if (name === "home") { await page.reload(); await ready(page); }
        }
        if (name === "home" && (width === 390 || width === 1440)) {
          await captureHomeChart(page, `after-chart-${theme}-${width}.png`);
          const styles = await page.locator("#chart").evaluate((node) => ({
            up: getComputedStyle(node.querySelector(".candles .up rect")).fill,
            down: getComputedStyle(node.querySelector(".candles .dn rect")).fill,
            motion: getComputedStyle(node.querySelector(".path")).transitionDuration
          }));
          assert.equal(styles.up, "none");
          assert.notEqual(styles.down, "none");
          assert.equal(styles.motion, "0s");
        }
        results.push(label);
      } catch (error) { errors.push(`${label}: ${error.message}`); }
    }
    assert.deepEqual(consoleErrors, [], `${theme}: console errors`);
    await context.close();
  }

  // Real interactions, beyond static screenshots.
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
  await page.goto(base + "/styleguide/");
  const specimen = page.locator('.theme-preview[data-theme="light"]');
  const demo = specimen.locator(".fig").first();
  const slider = demo.locator('input[type="range"]');
  await slider.focus();
  await page.keyboard.press("Home");
  assert.equal(await slider.inputValue(), "0");
  assert.equal(await demo.locator(".candle:visible").count(), 1);
  await page.keyboard.press("ArrowRight");
  assert.equal(await slider.inputValue(), "1");
  assert.match(await demo.locator("output").textContent(), /Bar 2 of 6/);
  await page.keyboard.press("End");
  await specimen.locator("[data-play]").click();
  assert.equal(await slider.inputValue(), "5", "Reduced motion jumps to the final frame");
  assert.equal(await specimen.locator("[data-play]").getAttribute("aria-pressed"), "false");
  const points = demo.locator(".candle");
  await points.first().focus();
  assert.equal(await page.locator(".tooltip:visible").count(), 1);
  const firstTip = await page.locator(".tooltip").textContent();
  await page.keyboard.press("ArrowRight");
  assert.equal(await points.nth(1).evaluate((node) => node === document.activeElement), true);
  assert.notEqual(await page.locator(".tooltip").textContent(), firstTip);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".tooltip:visible").count(), 0);
  await demo.locator(".data-table summary").click();
  assert.equal(await demo.locator(".data-table").evaluate((node) => node.open), true);
  const firstRadio = specimen.locator('input[type="radio"]').first();
  await firstRadio.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await specimen.locator('input[value="in"]').isChecked(), true);
  await page.locator("#menu-btn").click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#menu").isVisible(), false);
  assert.equal(await page.locator("#menu-btn").evaluate((node) => node === document.activeElement), true);
  await page.locator("#display-btn").click();
  await page.locator('[data-theme-set="dark"]').click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");

  // Automatic OS theme, explicit override, DPR and both reduced-motion paths.
  await page.evaluate(() => { localStorage.clear(); });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
  await page.reload();
  assert.equal(await page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--bull").trim()), themeTokens("dark")["--bull"]);
  await page.locator('.theme-preview[data-theme="light"] [data-play]').click();
  await page.waitForFunction(() => Number(document.querySelector("#light-bar").value) > 0);
  await page.locator('.theme-preview[data-theme="light"] [data-play]').click();
  const paused = await page.locator("#light-bar").inputValue();
  await page.waitForTimeout(550);
  assert.equal(await page.locator("#light-bar").inputValue(), paused, "Pause stops playback");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; document.documentElement.dataset.motion = "reduced"; });
  assert.equal(await page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--bull").trim()), themeTokens("light")["--bull"]);
  assert.equal(await page.locator(".wire-draw").first().evaluate((node) => getComputedStyle(node).animationDuration), "0s");
  const highDPR = await browser.newPage({ deviceScaleFactor: 2 });
  await highDPR.goto(base + "/styleguide/");
  assert.equal(await highDPR.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--hair").trim()), ".75px");
  await highDPR.close();
  const noJS = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  await noJS.goto(base + "/styleguide/");
  assert.equal(await noJS.locator(".data-table[open]").count(), 12);
  assert.equal(await noJS.locator(".candle:visible").count(), 12);
  assert.equal(await noJS.locator("[data-bar]:visible").count(), 12);
  assert.equal(await noJS.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await noJS.screenshot({ path: resolve(artifacts, "styleguide-no-js-320.png"), fullPage: true });
  await noJS.close();
  await page.close();
} finally {
  await browser.close();
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify({ browser: browser.version(), passed: results, errors }, null, 2) + "\n");
}
assert.deepEqual(errors, [], "UI checks failed");
console.log(`UI: ${results.length} route/theme/width combinations passed, plus keyboard, motion, theme, DPR and no-JS checks. Screenshots: ${artifacts}`);
