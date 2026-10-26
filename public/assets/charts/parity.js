import { frame, svg, scale, extent, signed, release, remember } from "./core.js";
import { connectTooltip } from "../components.js";
export const destroy = release;
export function render(el, data, opts) {
  release(el);
  const visible = data.slice(-60);
  const { plot } = frame(el, { ...opts, state: "research", title: "Parity / observed vs backtest", description: "A diagnostic comparison, separate from paper results. The plot shows up to 60 recent days; the table includes every published pair. Causes accompany mismatches." }, ["Day", "Observed R", "Backtest R", "Verdict", "Causes"], data.map((row) => [row.day, signed(row.live_r, "R"), signed(row.backtest_r, "R"), row.verdict, row.causes.join("; ")]));
  plot.classList.add("scroll-plot"); plot.tabIndex = 0; plot.role = "region"; plot.setAttribute("aria-label", "Parity comparison; scroll horizontally on a narrow screen");
  const height = Math.max(1, visible.length) * 68 + 40;
  const root = svg("svg", { viewBox: `0 0 700 ${height}`, role: "group", "aria-label": "Recorded observed and backtest R pairs" }), points = [];
  const x = scale(extent(visible.flatMap((d) => [d.live_r, d.backtest_r]), true), [180, 520]);
  root.append(svg("line", { x1: x(0), x2: x(0), y1: 12, y2: height - 12, stroke: "var(--wire)", "stroke-dasharray": "3 3" }));
  visible.forEach((row, i) => {
    const y = 20 + i * 68;
    root.append(svg("text", { x: 2, y: y + 20, class: "chart-axis" }, row.day));
    for (const [value, label, color, offset] of [[row.live_r, "Observed", "var(--ink)", 0], [row.backtest_r, "Backtest", "var(--signal)", 26]]) {
      const text = `${row.day}: ${label} ${signed(value, "R")}; ${row.verdict}${row.causes.length ? "; " + row.causes.join("; ") : ""}`;
      const bar = svg("rect", { x: Math.min(x(0), x(value)), y: y + offset, width: Math.max(1, Math.abs(x(value) - x(0))), height: 14, fill: color, tabindex: "0", role: "img", "aria-label": text, "data-tooltip": text });
      root.append(bar, svg("text", { x: 535, y: y + offset + 12, class: "chart-axis" }, `${label} ${signed(value, "R")}`)); points.push(bar);
    }
    if (row.verdict === "differs") root.append(svg("text", { x: 100, y: y + 42, class: "chart-axis" }, "DIFFERS"));
  });
  plot.append(root); remember(el, connectTooltip(points)); return { destroy: () => release(el) };
}
