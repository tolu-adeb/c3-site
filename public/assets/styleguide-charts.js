import { render as candles } from "./charts/candles.js";
import { render as equity } from "./charts/equity.js";
import { render as drawdown } from "./charts/drawdown.js";
import { render as sparkline } from "./charts/sparkline.js";
import { lazy } from "./charts/core.js";

const response = await fetch("/assets/styleguide-data.json");
if (response.ok) {
  const data = await response.json();
  const meta = { run_id: data.summary.run_id, source: "Seeded synthetic bars", sample: "In + out of sample", range: "30 Jul–5 Aug 2026", costs: "$1.24 RT / micro; 1-tick entry and stop slippage", methodology: "/methodology/#fixtures" };
  document.querySelectorAll("[data-chart]").forEach((el) => lazy(el, () => {
    const type = el.dataset.chart;
    if (type === "candles") return candles(el, data.session, { meta: { ...meta, sample: "In sample", range: "30 Jul 2026" }, title: "V1 / Fixture session" });
    if (type === "dense") {
      const bars = Array.from({ length: 320 }, (_, i) => [data.session.bars[0][0] + i * 300, ...data.session.bars[i % 78].slice(1)]);
      return candles(el, { bars, levels: [], trades: [] }, { meta: { ...meta, sample: "Synthetic density specimen", range: "320 repeated fixture bars" }, title: "V1 / Dense canvas specimen" });
    }
    return ({ equity, drawdown, sparkline })[type](el, data.equity, { meta, title: { equity: "V2 / Equity · USD per micro", drawdown: "V3 / Drawdown · USD per micro", sparkline: "V13 / Equity thumbnail" }[type] });
  }));
}
