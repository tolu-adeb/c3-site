// Commit-time fixture specimens; this is not a site build or a strategy exporter.
import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const fixture = (path) => readFile(new URL(`test/fixtures/bundle/${path}`, root), "utf8").then(JSON.parse);
const session = await fixture("runs/orx-synthetic-v1/sessions/2026-07-30.json");
const equity = await fixture("runs/orx-synthetic-v1/equity.json");
const summary = await fixture("runs/orx-synthetic-v1/summary.json");
const data = { synthetic: true, session, equity, summary };
const content = JSON.stringify(data) + "\n";
const target = new URL("public/assets/styleguide-data.json", root);
const check = process.argv.includes("--check");
if (check) {
  if (await readFile(target, "utf8") !== content) throw new Error("Chart specimens differ from fixtures; run node scripts/update-chart-specimens.mjs");
  console.log("Chart specimen data matches the synthetic fixture bundle.");
  process.exit(0);
}
await writeFile(target, content);
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const spec = (type, columns, rows) => `<div data-chart="${type}"><figure class="fig"><div class="fig-head"><span class="fig-index">${type.toUpperCase()} / FIXTURE</span><span class="chip state" data-state="illustration">Synthetic illustration</span></div><p class="note">The chart loads when visible. Its values are in the table below.</p><details class="data-table" data-table open><summary>Data table</summary><div class="scroll" role="region" aria-label="${type} fixture data" tabindex="0"><table class="tbl"><caption>${type} · synthetic fixture</caption><thead><tr>${columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<${i ? "td" : 'th scope="row"'}>${esc(v)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table></div></details><figcaption><a class="source" href="/methodology/#fixtures">orx-synthetic-v1 · seeded synthetic data · in + out of sample · Methodology</a></figcaption></figure></div>`;
const barRows = session.bars.map(([t, ...values]) => [new Date(t * 1000).toISOString(), ...values]);
const equityRows = equity.map((d) => [d.date, d.equity_usd, d.sample]);
const block = `<!-- chart-kit-start --><h3>Chart kit / fixture session</h3>${spec("candles", ["Time (UTC)", "Open", "High", "Low", "Close", "Volume"], barRows)}<h3>Equity</h3>${spec("equity", ["Session", "USD / micro", "Sample"], equityRows)}<h3>Underwater drawdown</h3>${spec("drawdown", ["Session", "Loss from peak (USD)", "Sample"], equity.map((d) => [d.date, -d.drawdown_usd, d.sample]))}<h3>Sparkline / 80 × 24</h3>${spec("sparkline", ["Session", "USD / micro", "Sample"], equityRows)}<h3>Canvas / 320 bars</h3><p class="component-note">Repeats synthetic fixture bars to exercise the dense renderer. This is a rendering stress sample, not an additional market session.</p>${spec("dense", ["Time (UTC)", "Open", "High", "Low", "Close", "Volume"], Array.from({ length: 320 }, (_, i) => { const [, ...v] = session.bars[i % session.bars.length]; return [new Date((session.bars[0][0] + i * 300) * 1000).toISOString(), ...v]; }))}<!-- chart-kit-end -->`;
const pagePath = new URL("public/styleguide/index.html", root);
let html = await readFile(pagePath, "utf8");
html = html.replaceAll(/<!-- chart-kit-start -->[\s\S]*?<!-- chart-kit-end -->/g, "");
html = html.replaceAll('<h3>Line drawing</h3>', block + '<h3>Line drawing</h3>');
if (!html.includes('src="/assets/styleguide-charts.js"')) html = html.replace('</body>', '<script type="module" src="/assets/styleguide-charts.js"></script></body>');
await writeFile(pagePath, html);
console.log("Updated chart specimens and their no-JS data tables.");
