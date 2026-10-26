import { frame, axes, extent, svg, points, observe, number, release, remember } from "./core.js";
export function destroy(el) { release(el); }
export function render(el, data, opts) {
  destroy(el);
  const rows = data.map((d) => ({ ...d, value: -d.drawdown_usd }));
  const { plot, caption } = frame(el, { ...opts, title: opts.title || "Drawdown · USD / micro" }, ["Session", "Loss from peak (USD)", "Sample"], rows.map((d) => [d.date, number(d.value), d.sample === "out" ? "Out of sample" : "In sample"]));
  const worst = rows.reduce((a, b) => !a || b.value < a.value ? b : a, null);
  if (worst) caption.prepend(document.createTextNode(`Maximum daily closing drawdown: ${number(worst.value)} USD on ${worst.date}. `));
  if (!rows.length) { caption.prepend(document.createTextNode("No exported sessions in this selection. ")); return { destroy: () => destroy(el) }; }
  const cleanup = observe(plot, () => {
    const dates = rows.map((d) => Date.parse(d.date));
    const a = axes(plot, extent(dates), extent(rows.map((d) => d.value), true), { xLabel: (v) => new Date(v).toISOString().slice(5, 10), label: "Drawdown in USD" });
    if (rows.length) {
      const line = rows.map((d, i) => `${i ? "L" : "M"}${a.x(dates[i])},${a.y(d.value)}`).join("");
      a.root.append(svg("path", { d: `${line}L${a.x(dates.at(-1))},${a.y(0)}L${a.x(dates[0])},${a.y(0)}Z`, fill: "var(--bear-wash)" }));
      a.root.append(svg("path", { d: line, fill: "none", stroke: "var(--bear)", "stroke-width": 1.5 }));
    }
    return points(a.root, rows.map((d, i) => ({ x: a.x(dates[i]), y: a.y(d.value), label: `${d.date}: ${number(d.value)} USD drawdown`, fill: "var(--bear)" })));
  });
  remember(el, cleanup); return { destroy: () => destroy(el) };
}
