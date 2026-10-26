import { frame, svg, scale, extent, number, release, remember } from "./core.js";
export function destroy(el) { release(el); }
export function render(el, data, opts) {
  destroy(el);
  const { plot } = frame(el, { ...opts, title: opts.title || "Equity thumbnail" }, ["Session", "USD / micro"], data.map((d) => [d.date, number(d.equity_usd)]));
  const root = svg("svg", { viewBox: "0 0 80 24", width: 80, height: 24, role: "img", "aria-label": `${opts.title || "Equity"}; last value ${number(data.at(-1)?.equity_usd || 0)} USD / micro` });
  root.classList.add("sparkline");
  const x = scale([0, Math.max(1, data.length - 1)], [1, 79]), y = scale(extent(data.map((d) => d.equity_usd)), [23, 1]);
  root.append(svg("path", { d: data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.equity_usd)}`).join(""), fill: "none", stroke: "var(--signal)", "stroke-width": 1 }));
  plot.append(root); remember(el, () => root.remove()); return { destroy: () => destroy(el) };
}
