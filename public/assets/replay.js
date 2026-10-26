import { loadBundle, dataLink, preview } from "./data.js";
import { node, sourceLink, time, number, signed } from "./charts/core.js";
import { render as candles } from "./charts/candles.js";
import { render as score } from "./charts/score.js";
import { metaFor } from "./results.js";
const $ = (id) => document.getElementById(id), params = new URLSearchParams(location.search);
let bundle, summary, index, session, run, day, cursor = 0, chart, scoreChart, scoreStamp, frame, playing = false, tick = 0, generation = 0;
const reduced = () => document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion:reduce)").matches;
function pause() { playing = false; cancelAnimationFrame(frame); $("replay-play").textContent = "Play"; $("replay-play").setAttribute("aria-pressed", "false"); }
function meta() {
  const sample = day >= summary.split.out_of_sample[0] && day <= summary.split.out_of_sample[1] ? "out" : "in";
  return metaFor(summary, [{ date: day, sample }]);
}
function paint() {
  if (!session) return;
  cursor = Math.max(0, Math.min(session.bars.length - 1, cursor));
  chart?.destroy(); chart = candles($("replay-chart"), session, { cursor, meta: meta(), title: `${day} / Five-minute bars · price points` });
  const [t, o, h, l, c] = session.bars[cursor];
  $("replay-position").value = cursor;
  const readout = `Bar ${cursor + 1} of ${session.bars.length} · ${time(t)} ET · Open ${number(o)} · High ${number(h)} · Low ${number(l)} · Close ${number(c)}`;
  $("replay-readout").textContent = readout; $("replay-position").setAttribute("aria-valuetext", readout);
  const decisions = session.decisions.filter((decision) => decision.t <= t), list = $("decision-log");
  list.replaceChildren(...decisions.map((decision) => {
    const li = node("li"), stamp = node("time", { datetime: new Date(decision.t * 1000).toISOString() }, `${time(decision.t)} ET · ${decision.kind}`);
    li.append(stamp, node("p", {}, decision.text)); return li;
  }));
  $("decision-empty").hidden = decisions.length > 0;
  const latest = decisions.findLast((decision) => decision.score !== undefined);
  if (scoreStamp !== (latest?.t ?? -1)) {
    scoreChart?.destroy(); scoreChart = score($("score-card"), latest, { meta: meta() }); scoreStamp = latest?.t ?? -1;
  }
  $("replay-step-back").disabled = cursor === 0; $("replay-step-next").disabled = cursor === session.bars.length - 1;
}
function jump(value) { pause(); cursor = value; paint(); }
function play() {
  if (playing) { pause(); return; }
  if (reduced()) { jump(session.bars.length - 1); return; }
  if (cursor === session.bars.length - 1) cursor = 0;
  playing = true; $("replay-play").textContent = "Pause"; $("replay-play").setAttribute("aria-pressed", "true"); tick = 0;
  function step(now) {
    if (!playing) return;
    if (!tick) tick = now;
    if (now - tick >= 250) { cursor++; tick = now; paint(); }
    if (cursor === session.bars.length - 1) pause(); else frame = requestAnimationFrame(step);
  }
  paint(); frame = requestAnimationFrame(step);
}
function signal() {
  const next = session.decisions.find((d) => d.kind === "signal" && d.t > session.bars[cursor][0]) || session.decisions.find((d) => d.kind === "signal");
  if (next) jump(session.bars.findIndex((bar) => bar[0] >= next.t));
}
function calendar() {
  const target = $("session-calendar"); target.replaceChildren();
  const months = Object.groupBy(index, (d) => d.date.slice(0, 7));
  for (const [month, days] of Object.entries(months)) {
    const field = node("fieldset", { class: "day-calendar" }); field.append(node("legend", {}, month));
    const grid = node("div", { class: "calendar-grid" });
    for (const label of ["M", "T", "W", "T", "F", "S", "S"]) grid.append(node("span", { "aria-hidden": "true" }, label));
    const date = new Date(month + "-01T12:00:00Z"), offset = (date.getUTCDay() + 6) % 7, count = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    for (let i = 0; i < offset; i++) grid.append(node("span", { "aria-hidden": "true" }));
    for (let n = 1; n <= count; n++) {
      const entry = days.find((d) => Number(d.date.slice(-2)) === n);
      if (!entry) { grid.append(node("span", { class: "calendar-missing", "aria-hidden": "true" }, n)); continue; }
      const button = node("button", { type: "button", class: `calendar-day ${entry.net_r < 0 ? "negative" : "positive"}`, "aria-label": `${entry.date}, ${signed(entry.net_r, "R")}, ${entry.n_trades} trades${entry.has_bars ? "" : ", bars unavailable"}`, "aria-pressed": String(entry.date === day) });
      const brief = (entry.net_r > 0 ? "+" : entry.net_r < 0 ? "−" : "") + number(Math.abs(entry.net_r), 1);
      button.disabled = !entry.has_bars; button.append(node("span", {}, n), node("small", {}, brief));
      button.addEventListener("click", () => loadDay(entry.date).catch(fail)); grid.append(button);
    }
    field.append(grid); target.append(field);
  }
  $("calendar-source").replaceChildren(sourceLink(metaFor(summary, index.map((d) => ({ date: d.date, sample: d.date >= summary.split.out_of_sample[0] ? "out" : "in" })))));
}
function fail(error) { pause(); $("data-status").hidden = false; $("data-status").textContent = error.message; }
async function loadDay(date, updateURL = true) {
  const token = ++generation; pause();
  if (!index.some((d) => d.date === date && d.has_bars)) throw new Error("That session has no published bars in this run.");
  const next = await bundle.read(`runs/${run}/sessions/${date}.json`);
  if (token !== generation) return;
  session = next; day = date; scoreStamp = null;
  cursor = reduced() ? session.bars.length - 1 : 0;
  $("replay-position").max = session.bars.length - 1;
  $("day-picker").value = date;
  const at = index.findIndex((d) => d.date === date);
  $("previous-session").disabled = !index.slice(0, at).some((d) => d.has_bars); $("next-session").disabled = !index.slice(at + 1).some((d) => d.has_bars);
  $("session-context").replaceChildren(node("p", {}, `Bias: ${session.context.bias} · 50-day trend: ${session.context.trend_50d} · FOMC: ${session.context.fomc ? "yes" : "no"} · Mode: ${session.context.mode}`), sourceLink(meta()));
  $("data-status").hidden = true; $("replay-workspace").hidden = false;
  if (updateURL) { params.set("run", run); params.set("day", day); history.pushState(null, "", location.pathname + "?" + params); }
  paint(); calendar();
  $("replay-backtests").href = dataLink("/backtests/", { run });
}
async function loadRun(id, requestedDay, updateURL = true) {
  pause(); const token = ++generation;
  const [nextSummary, nextIndex] = await Promise.all([bundle.read(`runs/${id}/summary.json`), bundle.read(`runs/${id}/sessions/index.json`)]);
  if (token !== generation) return;
  run = id; summary = nextSummary; index = nextIndex;
  if (!["backtest", "walk_forward"].includes(summary.kind)) throw new Error("This replay only shows hypothetical tested sessions.");
  const picker = $("day-picker"); picker.replaceChildren();
  index.forEach((d) => { const option = node("option", { value: d.date }, `${d.date} · ${signed(d.net_r, "R")}${d.has_bars ? "" : " · no bars"}`); option.disabled = !d.has_bars; picker.append(option); });
  $("replay-notice").textContent = (bundle.manifest.synthetic ? "Synthetic fixture bars. These are test values, not strategy results. " : "Hypothetical backtest session. ") + (preview ? "Private preview. " : "") + "Only exported bars, plans and decisions are drawn.";
  const featured = bundle.manifest.featured;
  const date = requestedDay || (id === featured.run ? featured.day : index.find((d) => d.has_bars)?.date);
  await loadDay(date, updateURL);
}
$("replay-position").addEventListener("input", () => jump(Number($("replay-position").value)));
$("replay-play").addEventListener("click", play);
$("replay-step-back").addEventListener("click", () => jump(cursor - 1));
$("replay-step-next").addEventListener("click", () => jump(cursor + 1));
$("jump-signal").addEventListener("click", signal);
$("day-picker").addEventListener("change", () => loadDay($("day-picker").value).catch(fail));
$("previous-session").addEventListener("click", () => loadDay(index.slice(0, index.findIndex((d) => d.date === day)).findLast((d) => d.has_bars).date).catch(fail));
$("next-session").addEventListener("click", () => loadDay(index.slice(index.findIndex((d) => d.date === day) + 1).find((d) => d.has_bars).date).catch(fail));
$("random-session").addEventListener("click", () => { const days = index.filter((d) => d.has_bars); loadDay(days[Math.floor(Math.random() * days.length)].date).catch(fail); });
$("replay-run").addEventListener("change", () => loadRun($("replay-run").value).catch(fail));
document.addEventListener("keydown", (event) => {
  if (!session || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest("select,textarea,input:not([type=range]),button,a,summary")) return;
  if (event.target.matches("input[type=range]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const action = { ArrowLeft: () => jump(cursor - 1), ArrowRight: () => jump(cursor + 1), Home: () => jump(0), End: () => jump(session.bars.length - 1), " ": play, s: signal, S: signal }[event.key];
  if (action) { event.preventDefault(); action(); }
});
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
document.addEventListener("c3:motion", pause);
matchMedia("(prefers-reduced-motion:reduce)").addEventListener("change", pause);
window.addEventListener("popstate", () => { if (!bundle) return; const state = new URLSearchParams(location.search); loadRun(state.get("run") || bundle.manifest.featured.run, state.get("day"), false).catch(fail); });
try {
  bundle = await loadBundle();
  const summaries = await Promise.all(bundle.manifest.runs.map((id) => bundle.read(`runs/${id}/summary.json`)));
  summaries.filter((s) => ["backtest", "walk_forward"].includes(s.kind)).forEach((s) => $("replay-run").append(node("option", { value: s.run_id }, s.run_id)));
  const selected = params.get("run") || bundle.manifest.featured.run;
  if (!bundle.manifest.runs.includes(selected)) throw new Error("That run is not available in this bundle.");
  $("replay-run").value = selected;
  await loadRun(selected, params.get("day"), false);
} catch (error) { fail(error); }
