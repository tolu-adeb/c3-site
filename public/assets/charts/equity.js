import { frame, axes, extent, svg, points, observe, number, release, remember } from "./core.js";
export function destroy(el) { release(el); }
export function render(el, data, opts) {
  destroy(el);
  let r = 0;
  const rows = data.map((d) => ({ ...d, value: opts.unit === "r" ? (r += d.net_r) : d.equity_usd }));
  const unit = opts.unit === "r" ? "R" : "USD / micro";
  const sample = (d) => opts.sample === "paper" ? "Paper (virtual)" : d.sample === "out" ? "Out of sample" : "In sample";
  const { plot, caption } = frame(el, { ...opts, title: opts.title || `Equity · ${unit}` }, ["Session", unit, "Sample"], rows.map((d) => [d.date, number(d.value), sample(d)]));
  if (rows.length) caption.prepend(document.createTextNode(`End value: ${number(rows.at(-1).value)} ${unit}. `));
  if (!rows.length) { caption.prepend(document.createTextNode("No exported sessions in this selection. ")); return { destroy: () => destroy(el) }; }
  const cleanup = observe(plot, () => {
    const dates = rows.map((d) => Date.parse(d.date));
    const a = axes(plot, extent(dates), extent(rows.map((d) => d.value), true), { xLabel: (v) => new Date(v).toISOString().slice(5, 10), label: `Equity in ${unit}` });
    for (let i = 1; i < rows.length; i++) a.root.append(svg("path", { d: `M${a.x(dates[i - 1])},${a.y(rows[i - 1].value)}L${a.x(dates[i])},${a.y(rows[i].value)}`, fill: "none", stroke: rows[i].sample === "out" ? "var(--signal)" : "var(--ink)", "stroke-width": 1.5 }));
    const split = opts.sample === "paper" ? -1 : rows.findIndex((d) => d.sample === "out");
    if (split >= 0) {
      a.root.append(svg("line", { x1: a.x(dates[split]), x2: a.x(dates[split]), y1: a.margin.top, y2: a.height - a.margin.bottom, stroke: "var(--wire)", "stroke-dasharray": "4 4" }));
      a.root.append(svg("text", { class: "chart-axis", x: a.x(dates[split]) - 4, y: 13, "text-anchor": "end" }, "Holdout starts"));
    }
    return points(a.root, rows.map((d, i) => ({ x: a.x(dates[i]), y: a.y(d.value), label: `${d.date}: ${number(d.value)} ${unit}; ${sample(d)}`, fill: d.sample === "out" ? "var(--signal)" : "var(--ink)" })));
  });
  remember(el, cleanup);
  return { destroy: () => destroy(el) };
}
