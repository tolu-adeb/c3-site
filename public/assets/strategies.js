import { loadBundle, dataLink } from "./data.js";
import { node, sourceLink, signed, lazy } from "./charts/core.js";
import { render as sparkline } from "./charts/sparkline.js";
import { metaFor } from "./results.js";
const labels = { live: "Live", paper: "Paper", research: "Research", retired: "Retired", in_build: "In build" };
export function stateChip(state) { return node("span", { class: "chip state", "data-state": state }, labels[state] || state); }
const target = document.getElementById("strategy-cards"), status = document.getElementById("data-status");
if (target) {
  document.getElementById("main").setAttribute("aria-busy", "true");
  try {
    const bundle = await loadBundle(), strategies = await bundle.read("strategies.json");
    target.replaceChildren();
    status.textContent = bundle.manifest.synthetic ? "Synthetic fixture strategies. States and values are display examples, not market evidence." : "Strategy states and descriptions come from the published exporter.";
    status.className = "notice";
    for (const strategy of strategies) {
      const card = node("article", { class: "strategy-card", "data-strategy": strategy.id, "data-state": strategy.state });
      const heading = node("h2"); heading.append(node("a", { href: dataLink(`/strategies/${strategy.id}/`) }, strategy.name));
      card.append(stateChip(strategy.state), heading, node("p", {}, strategy.one_line));
      if (strategy.retired_reason) card.append(node("p", { class: "notice" }, strategy.retired_reason));
      if (strategy.state === "in_build") card.append(node("p", { class: "note" }, "Theory only. No performance results are shown."));
      if (strategy.state !== "in_build" && strategy.runs.length) {
        const run = strategy.runs.includes(bundle.manifest.featured.run) ? bundle.manifest.featured.run : strategy.runs[0];
        const [summary, daily] = await Promise.all([bundle.read(`runs/${run}/summary.json`), bundle.read(`runs/${run}/equity.json`)]);
        if (["backtest", "walk_forward"].includes(summary.kind)) {
          const meta = metaFor(summary, daily);
          card.append(node("p", {}, `Hypothetical backtest: ${summary.stats.trades} trades; ${signed(summary.stats.avg_r, "R")} average.`), sourceLink(meta));
          const plot = node("div"); card.append(plot); target.append(card);
          lazy(plot, () => sparkline(plot, daily, { meta, title: "Headline backtest / equity" }));
        }
      }
      target.append(card);
    }
  } catch (error) { status.textContent = error.message; }
  finally { document.getElementById("main").setAttribute("aria-busy", "false"); }
}
