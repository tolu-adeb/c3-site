import { loadBundle, dataLink } from "./data.js";
import { node, sourceLink, lazy, signed } from "./charts/core.js";
import { stateChip } from "./strategies.js";
import { render as equity } from "./charts/equity.js";
import { render as drawdown } from "./charts/drawdown.js";
import { render as histogram } from "./charts/histogram.js";
import { render as segmentBars } from "./charts/segments.js";
import { render as candles } from "./charts/candles.js";
import { metaFor, statStrip, segments } from "./results.js";
const $ = (id) => document.getElementById(id), id = location.pathname.split("/").filter(Boolean)[1];
$("main").setAttribute("aria-busy", "true");
function list(title, values) {
  const section = node("section"), items = node("ul"); section.append(node("h2", {}, title));
  if (!values.length) { section.append(node("p", { class: "note" }, "Not published.")); return section; }
  values.forEach((value) => items.append(node("li", {}, value))); section.append(items); return section;
}
try {
  const bundle = await loadBundle(), strategies = await bundle.read("strategies.json"), strategy = strategies.find((s) => s.id === id);
  if (!strategy) throw new Error("That strategy is not included in this bundle.");
  $("page-title").textContent = strategy.name;
  $("data-status").textContent = (bundle.manifest.synthetic ? "Synthetic fixture description. No market evidence is presented here. " : "Published strategy description. ") + strategy.one_line;
  $("data-status").className = "notice";
  const theory = $("strategy-theory");
  theory.replaceChildren();
  theory.append(stateChip(strategy.state), node("h2", {}, "Mechanism"), node("p", {}, strategy.mechanism), list("Rules", strategy.rules), list("Exits", strategy.exits), list("Filters", strategy.filters), node("h2", {}, "Scoring"), node("p", {}, strategy.scoring));
  if (strategy.retired_reason) theory.append(node("p", { class: "notice" }, `Retired: ${strategy.retired_reason}`));
  if (strategy.state === "in_build") theory.append(node("p", { class: "notice" }, "In build. Theory only; no performance results are shown."));
  if (strategy.state !== "in_build" && strategy.runs.length) {
    const run = strategy.runs.includes(bundle.manifest.featured.run) ? bundle.manifest.featured.run : strategy.runs[0], prefix = `runs/${run}/`;
    const [summary, trades, daily] = await Promise.all([bundle.read(prefix + "summary.json"), bundle.read(prefix + "trades.json"), bundle.read(prefix + "equity.json")]);
    if (["backtest", "walk_forward"].includes(summary.kind)) {
      const results = $("strategy-results"), meta = metaFor(summary, daily), out = trades.filter((t) => t.sample === "out");
      results.hidden = false;
      statStrip($("strategy-stats"), summary.stats, meta, out.length ? out.reduce((sum, t) => sum + t.r, 0) / out.length : null);
      for (const [id, render, data, opts] of [["strategy-equity", equity, daily, {}], ["strategy-drawdown", drawdown, daily, {}], ["strategy-histogram", histogram, trades, {}], ["strategy-segments", segmentBars, segments(trades, "side"), { title: "Average R by side" }]]) lazy($(id), () => render($(id), data, { meta, ...opts }));
      $("strategy-run-link").href = dataLink("/backtests/", { run });
      const sorted = [...daily].sort((a, b) => a.net_r - b.net_r), choices = [["Best", sorted.at(-1)], ["Worst", sorted[0]], ["Median", sorted[Math.floor(sorted.length / 2)]]];
      for (const [label, session] of choices) {
        if (!session) continue;
        const card = node("article", { class: "session-card", "data-session-choice": label.toLowerCase() });
        card.append(node("h3", {}, `${label} session · ${session.date}`), node("p", {}, `${signed(session.net_r, "R")} net, exported after costs.`));
        const path = prefix + `sessions/${session.date}.json`;
        if (bundle.manifest.files.some((f) => f.path === path)) {
          const data = await bundle.read(path), host = node("div"); card.append(host, node("a", { href: dataLink("/replay/", { run, day: session.date }) }, "Replay this session"));
          $("strategy-sessions").append(card);
          lazy(host, () => candles(host, data, { meta: metaFor(summary, [session]), title: `${label} / ${session.date}` }));
        } else { card.append(node("p", { class: "note" }, "Bars were not exported for this session."), sourceLink(metaFor(summary, [session]))); $("strategy-sessions").append(card); }
      }
    }
  }
  if (["live", "paper"].includes(strategy.state)) {
    $("strategy-forward").append(node("h2", {}, "Forward record"), node("p", {}, "A strategy-specific forward series has not been exported. The aggregate paper record is labeled separately."), node("a", { href: dataLink("/track-record/") }, "Read the paper track record"));
  }

} catch (error) { $("data-status").textContent = error.message; }
finally { $("main").setAttribute("aria-busy", "false"); }
