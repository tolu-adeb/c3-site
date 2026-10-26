import { loadBundle, preview, viewKey } from "./data.js";
import { node, number, signed, sourceLink } from "./charts/core.js";
import { render as equity } from "./charts/equity.js";
import { render as monthly } from "./charts/monthly.js";
import { render as parity } from "./charts/parity.js";
const main = document.querySelector("main"), box = document.querySelector("#track");
main.setAttribute("aria-busy", "true");
const fmt = (value, suffix = "") => Number.isFinite(value) ? number(value) + suffix : "Not exported";
const pnl = (value) => Number.isFinite(value) ? signed(value) : "Not exported";
function costsText(costs) {
  if (!costs) return "Commission included; fill and slippage metadata not exported";
  return `${fmt(costs.commission_rt_usd)} USD round trip / ${costs.contract || "contract not exported"}; ${fmt(costs.entry_slip_ticks)} entry ticks; ${fmt(costs.stop_slip_ticks)} stop ticks`;
}
async function paper() {
  const response = await fetch(preview ? "/api/p/track" : "/api/track", { headers: preview ? { authorization: "Bearer " + viewKey() } : {}, cache: "no-store" });
  if (!response.ok) throw new Error("Paper results could not load. Refresh to try again.");
  const data = await response.json(), stats = data.stats;
  box.replaceChildren();
  if ((!data.public && !preview) || !stats || stats.sample !== "paper") {
    box.append(node("p", { class: "empty" }, "No public paper results yet. A backtest does not fill this space.")); return;
  }
  const meta = { run_id: stats.run_id || "Run id not exported", source: stats.source || "Market data source not exported (signed bot snapshot)", sample: "Paper (virtual) trades", range: [stats.since || stats.first, stats.last].filter(Boolean).join(" – "), costs: costsText(stats.costs), methodology: "/methodology/#paper" };
  const strip = node("div", { class: "stats", id: "paper-stats" });
  for (const [label, value] of [["Closed paper trades", fmt(stats.trades)], ["Paper win rate", Number.isFinite(stats.win_rate) ? fmt(stats.win_rate * 100, "%") : "Not exported"], ["Paper net points", pnl(stats.net_pts)], ["Paper average R", fmt(stats.avg_r, "R")]]) {
    const stat = node("div", { class: "stat" }); stat.append(node("b", {}, value), node("span", {}, label)); strip.append(stat);
  }
  box.append(strip, sourceLink(meta));
  box.append(node("p", { class: "note" }, `${stats.label ? stats.label + ". " : ""}Virtual trades, one MNQ micro contract. ${Number.isFinite(data.updated_ms) ? "Signed snapshot received " + new Date(data.updated_ms).toISOString() + "." : "Snapshot time not exported."}`));
  const curve = node("div", { id: "paper-equity" }); box.append(curve);
  if (stats.equity_status === "available" && stats.equity?.length) equity(curve, stats.equity, { title: "Paper daily closing equity · USD / micro", description: "Exported cumulative paper results after reported costs. Daily closes do not show intraday risk.", sample: "paper", state: "paper", meta });
  else curve.append(node("p", { class: "note" }, stats.equity_status === "rejected" ? "The exported daily equity series is inconsistent. Totals remain available; the curve is withheld." : "Daily paper equity has not been exported yet. The signed totals and monthly table remain available."));
  if (stats.months?.length) {
    const heatmap = node("div", { id: "paper-monthly" }); box.append(heatmap);
    monthly(heatmap, stats.months, { title: "Paper monthly net · USD / micro", description: "Signed paper values after reported costs. Hatched months have no export. The table includes every published month; R may be unavailable in older snapshots.", state: "paper", meta });
    heatmap.querySelector("details").open = true;
  } else box.append(node("p", { class: "note" }, "Monthly paper results have not been exported yet."));
}
async function diagnostic() {
  const host = document.querySelector("#parity");
  try {
    const bundle = await loadBundle(), rows = await bundle.read("parity/index.json");
    if (!rows.length) { host.textContent = "No paired diagnostic days have been exported yet."; return; }
    const meta = { run_id: `Run id not exported · bundle ${bundle.manifest.bundle}`, source: bundle.manifest.synthetic ? "Synthetic parity export" : "Paired observed/backtest export; feed not specified", sample: "Diagnostic only · observed + hypothetical backtest", range: rows[0].day + " – " + rows.at(-1).day, methodology: "/methodology/#parity" };
    const plot = node("div"); host.replaceChildren(plot); parity(plot, rows, { meta });
    const differs = rows.filter((row) => row.verdict === "differs");
    host.append(node("h3", {}, "Differing days"));
    if (!differs.length) host.append(node("p", {}, "No differing days in this export. Matching pairs do not establish a future result."));
    else {
      const list = node("ul", { id: "parity-causes" });
      differs.forEach((row) => list.append(node("li", {}, `${row.day}: ${row.causes.length ? row.causes.join(" ") : "No cause was exported."}`))); host.append(list);
    }
  } catch (error) { host.textContent = error.status === 404 ? "Parity diagnostics have not been published yet." : error.message; }
}
await Promise.all([paper().catch((error) => {
  box.append(node("p", { class: "msg err", role: "status" }, error.message));
}), diagnostic()]);
main.setAttribute("aria-busy", "false");
