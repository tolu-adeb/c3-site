import { loadBundle, dataLink, preview } from "./data.js";
import { node, table, signed, sourceLink, lazy } from "./charts/core.js";
import { render as equity } from "./charts/equity.js";
import { render as drawdown } from "./charts/drawdown.js";
import { render as heatmap } from "./charts/monthly.js";
import { render as histogram } from "./charts/histogram.js";
import { render as segmentBars } from "./charts/segments.js";
import { render as comparison } from "./charts/comparison.js";
import { aggregate, monthly, segments, metaFor, statStrip } from "./results.js";

const $ = (id) => document.getElementById(id), form = $("filters"), params = new URLSearchParams(location.search);
let bundle, summary, trades, sessions, run, charts = [], version = 0;
const filters = ["from", "to", "side", "setup", "exit", "month"];
if (preview) $("static-summary").hidden = true;
function status(message) { $("data-status").textContent = message; $("data-status").hidden = false; }
function chart(id, renderer, data, opts) {
  const host = $(id); host.replaceChildren(node("p", { class: "note" }, "Chart loads when visible."));
  charts.push(lazy(host, () => renderer(host, data, opts)));
}
function filterOptions(name, values) {
  const select = form.elements[name];
  select.replaceChildren(node("option", { value: "" }, `All ${name === "exit" ? "exits" : name === "month" ? "months" : "setups"}`));
  [...new Set(values)].sort().forEach((value) => select.append(node("option", { value }, value)));
}
function draw() {
  if (!summary) return;
  charts.forEach((chart) => chart.destroy()); charts = [];
  const values = Object.fromEntries(filters.map((key) => [key, form.elements[key].value]));
  const dates = sessions.filter((d) => (!values.from || d.date >= values.from) && (!values.to || d.date <= values.to) && (!values.month || d.date.startsWith(values.month)));
  const selectedDates = new Set(dates.map((d) => d.date));
  const rows = trades.filter((t) => selectedDates.has(t.date) && (!values.side || t.side === values.side) && (!values.setup || t.setup === values.setup) && (!values.exit || t.exit_reason === values.exit));
  const { daily, stats } = aggregate(rows, dates), meta = metaFor(summary, dates);
  const out = rows.filter((t) => t.sample === "out");
  statStrip($("backtest-stats"), stats, meta, out.length ? out.reduce((s, t) => s + t.r, 0) / out.length : null);
  chart("equity-chart", equity, daily, { meta, title: "Equity · selected trades · USD per micro" });
  chart("drawdown-chart", drawdown, daily, { meta });
  chart("monthly-chart", heatmap, monthly(rows, dates), { meta });
  chart("histogram-chart", histogram, rows, { meta });
  chart("segments-chart", segmentBars, segments(rows, $("breakdown").value), { meta, title: `Average R by ${$("breakdown").selectedOptions[0].textContent.toLowerCase()}` });
  const partitions = ["in", "out"].map((sample) => {
    const { stats } = aggregate(rows.filter((t) => t.sample === sample), dates.filter((d) => d.sample === sample));
    return { sample, stats: { ...stats, win_rate: stats.trades ? stats.win_rate : null, avg_r: stats.trades ? stats.avg_r : null, net_dd: stats.max_dd_usd ? stats.net_usd / stats.max_dd_usd : null } };
  });
  chart("comparison-chart", comparison, partitions, { meta });
  const sorted = [...rows].sort($("trade-sort").value === "r-desc" ? (a, b) => b.r - a.r : $("trade-sort").value === "r-asc" ? (a, b) => a.r - b.r : (a, b) => a.opened.localeCompare(b.opened));
  const dataTable = table(["Session / replay", "ID", "Setup", "Side", "Net R", "Net USD", "Exit", "Sample"], sorted.map((t) => [t.date, t.id, t.setup, t.side, signed(t.r, "R"), signed(t.usd), t.exit_reason, t.sample === "out" ? "Out of sample" : "In sample"]), "Selected exported trades");
  dataTable.open = true;
  dataTable.querySelectorAll("tbody tr").forEach((row, i) => {
    const trade = sorted[i]; row.dataset.tradeId = trade.id;
    row.firstElementChild.replaceChildren(node("a", { href: dataLink("/replay/", { run, day: trade.date }) }, trade.date));
  });
  $("trade-table").replaceChildren(dataTable, sourceLink(meta));
  $("trade-count").textContent = `${rows.length} selected trades across ${dates.length} sessions. ${rows.length ? "" : "No trades match these filters."}`;
  for (const key of filters) { if (values[key]) params.set(key, values[key]); else params.delete(key); }
  params.set("run", run);
  if ($("trade-sort").value !== "date") params.set("sort", $("trade-sort").value); else params.delete("sort");
  history.replaceState(null, "", location.pathname + "?" + params);
  $("range-from").value = Math.max(0, sessions.findIndex((d) => d.date >= (values.from || sessions[0].date)));
  const end = sessions.findLastIndex((d) => d.date <= (values.to || sessions.at(-1).date));
  $("range-to").value = Math.max(0, end);
  $("range-from-label").textContent = values.from || sessions[0]?.date || "—";
  $("range-to-label").textContent = values.to || sessions.at(-1)?.date || "—";
}
async function loadRun(id, reset = false) {
  const generation = ++version;
  const [nextSummary, nextTrades, nextDaily] = await Promise.all([bundle.read(`runs/${id}/summary.json`), bundle.read(`runs/${id}/trades.json`), bundle.read(`runs/${id}/equity.json`)]);
  if (generation !== version) return;
  if (!["backtest", "walk_forward"].includes(nextSummary.kind)) throw new Error("This page only shows hypothetical backtest and walk-forward runs.");
  run = id; summary = nextSummary; trades = nextTrades; sessions = nextDaily;
  filterOptions("setup", trades.map((t) => t.setup)); filterOptions("exit", trades.map((t) => t.exit_reason)); filterOptions("month", sessions.map((d) => d.date.slice(0, 7)));
  filters.forEach((key) => { form.elements[key].value = reset ? "" : params.get(key) || ""; });
  for (const key of ["from", "to"]) { form.elements[key].min = summary.dataset.start; form.elements[key].max = summary.dataset.end; }
  $("range-from").max = $("range-to").max = Math.max(0, sessions.length - 1);
  $("trade-sort").value = params.get("sort") || "date";
  $("run-note").replaceChildren(node("p", {}, (bundle.manifest.synthetic ? "Synthetic fixture data. These are test values, not strategy results. " : "Hypothetical backtest results. ") + summary.label), sourceLink(metaFor(summary, sessions)));
  if (preview) $("run-note").prepend(node("p", {}, "Private preview. Data is read with this browser’s saved view key."));
  $("data-status").hidden = true; $("static-summary").hidden = true; $("explorer").hidden = false;
  draw();
}
form.addEventListener("submit", (e) => e.preventDefault());
form.addEventListener("change", draw);
$("trade-sort").addEventListener("change", draw);
$("breakdown").addEventListener("change", draw);
let brushFrame;
for (const [id, field] of [["range-from", "from"], ["range-to", "to"]]) $(id).addEventListener("input", () => {
  form.elements[field].value = sessions[Number($(id).value)]?.date || "";
  if (form.elements.from.value && form.elements.to.value && form.elements.from.value > form.elements.to.value) form.elements[field === "from" ? "to" : "from"].value = form.elements[field].value;
  cancelAnimationFrame(brushFrame); brushFrame = requestAnimationFrame(draw);
});
status("Loading exported runs…");
try {
  bundle = await loadBundle();
  const summaries = await Promise.all(bundle.manifest.runs.map((id) => bundle.read(`runs/${id}/summary.json`)));
  const backtests = summaries.filter((s) => ["backtest", "walk_forward"].includes(s.kind));
  if (!backtests.length) throw new Error("Results not published yet.");
  const requested = params.get("run") || bundle.manifest.featured.run;
  if (!backtests.some((s) => s.run_id === requested)) throw new Error("That backtest run is not available in the current bundle.");
  const picker = $("runs");
  backtests.forEach((s) => {
    const label = node("label"), input = node("input", { type: "radio", name: "run", value: s.run_id });
    input.checked = s.run_id === requested;
    input.addEventListener("change", () => loadRun(s.run_id, true).catch((e) => status(e.message)));
    label.append(input, node("span", {}, s.run_id)); picker.append(label);
  });
  await loadRun(requested);
} catch (error) { if (error.status === 404) $("static-summary").hidden = true; status(error.message); }
