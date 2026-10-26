import { frame, svg, axes, extent, scale, observe, number, signed, points, release, remember } from "./core.js";
import { connectTooltip } from "../components.js";
let serial = 0;
export const destroy = release;
function hatching(root) {
  const id = `chart-hatch-${++serial}`, defs = svg("defs"), pattern = svg("pattern", { id, width: 6, height: 6, patternUnits: "userSpaceOnUse" });
  pattern.append(svg("path", { d: "M-1 1L1-1M0 6L6 0M5 7L7 5", stroke: "var(--wire)", "stroke-width": 1 }));
  defs.append(pattern); root.append(defs); return `url(#${id})`;
}
export function renderMonthly(el, data, opts) {
  release(el);
  const { plot } = frame(el, { ...opts, title: opts.title || "Monthly net · USD / micro", description: "Signed values after run costs. Hatched cells have no exported session. Scroll horizontally for other months on a narrow screen." }, ["Month", "Trades", "Net USD", "Net R"], data.map((d) => [d.month, d.trades, signed(d.net_usd), signed(d.net_r, "R")]));
  plot.classList.add("scroll-plot", "heatmap"); plot.tabIndex = 0; plot.role = "region"; plot.setAttribute("aria-label", "Monthly heatmap; scroll horizontally on narrow screens");
  const years = [...new Set(data.map((d) => d.month.slice(0, 4)))];
  const root = svg("svg", { viewBox: `0 0 840 ${Math.max(1, years.length) * 64 + 38}`, role: "group", "aria-label": "Monthly net USD, by calendar year" }), hatch = hatching(root), cells = [];
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].forEach((month, i) => root.append(svg("text", { x: 72 + i * 64, y: 18, class: "chart-axis", "text-anchor": "middle" }, month)));
  years.forEach((year, row) => {
    root.append(svg("text", { x: 2, y: 60 + row * 64, class: "chart-axis" }, year));
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, "0")}`, value = data.find((d) => d.month === key), x = 42 + m * 64, y = 30 + row * 64;
      const label = value ? `${key}: ${signed(value.net_usd)} USD, ${value.trades} trades` : `${key}: no exported sessions`;
      const cell = svg("g", { tabindex: "0", role: "img", "aria-label": label, "data-tooltip": label });
      cell.append(svg("rect", { x, y, width: 60, height: 54, fill: !value ? hatch : value.net_usd < 0 ? "var(--bear-wash)" : "var(--bull-wash)", stroke: value ? value.net_usd < 0 ? "var(--bear)" : "var(--bull)" : "var(--wire)" }));
      cell.append(svg("text", { x: x + 30, y: y + 32, class: "chart-axis", "text-anchor": "middle" }, value ? signed(value.net_usd) : "—"));
      root.append(cell); cells.push(cell);
    }
  });
  plot.append(root);
  const scroll = requestAnimationFrame(() => {
    if (data.length) plot.scrollLeft = Math.max(0, (42 + (Number(data[0].month.slice(5)) - 1) * 64 - 32) * plot.scrollWidth / 840);
  });
  const cleanup = connectTooltip(cells); remember(el, () => { cancelAnimationFrame(scroll); cleanup(); }); return { destroy: () => release(el) };
}
export function renderHistogram(el, trades, opts) {
  release(el);
  const bins = [{ low: -Infinity, high: -1.5, label: "< −1.5R", x: -1.75 }, ...Array.from({ length: 22 }, (_, i) => { const low = -1.5 + i * .25; return { low, high: low + .25, label: `${number(low)} to ${number(low + .25)}R`, x: low }; }), { low: 4, high: Infinity, label: "≥ 4R", x: 4 }].map((b) => ({ ...b, n: trades.filter((t) => t.r >= b.low && t.r < b.high).length }));
  const sorted = trades.map((t) => t.r).sort((a, b) => a - b), mean = sorted.length ? sorted.reduce((s, r) => s + r, 0) / sorted.length : 0;
  const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : 0;
  const { plot } = frame(el, { ...opts, title: "Trade R distribution", description: trades.length ? `${trades.length} trades. Mean ${signed(mean, "R")}; median ${signed(median, "R")}. Bins are 0.25R; edge bins keep all outliers.` : "No selected trades. Mean and median are undefined." }, ["Net R interval", "Trades"], bins.map((b) => [b.label, b.n]));
  const cleanup = observe(plot, () => {
    const a = axes(plot, [-1.75, 4.25], [0, Math.max(1, ...bins.map((b) => b.n))], { label: "Trade counts by net R", xLabel: (r) => number(r) + "R" });
    const nodes = [];
    for (const bin of bins) {
      const label = `${bin.label}: ${bin.n} trades`;
      const rect = svg("rect", { x: a.x(bin.x) + 1, y: a.y(bin.n), width: Math.max(.5, a.x(bin.x + .25) - a.x(bin.x) - 2), height: Math.max(1, a.y(0) - a.y(bin.n)), fill: bin.high <= 0 ? "var(--bear)" : "var(--bull)", tabindex: "0", role: "img", "aria-label": label, "data-tooltip": label });
      a.root.append(rect); nodes.push(rect);
    }
    for (const [value, label, color, offset] of [[mean, "Mean", "var(--ink)", 0], [median, "Median", "var(--signal)", 16]]) {
      const x = a.x(Math.max(-1.75, Math.min(4.25, value)));
      a.root.append(svg("line", { x1: x, x2: x, y1: 18, y2: a.height - a.margin.bottom, stroke: color, "stroke-dasharray": "3 3" }));
      a.root.append(svg("text", { x: Math.max(56, Math.min(a.width - 65, x + 4)), y: 30 + offset, class: "chart-axis" }, label));
    }
    return connectTooltip(nodes);
  });
  remember(el, cleanup); return { destroy: () => release(el) };
}
export function renderSegments(el, data, opts) {
  release(el);
  const { plot } = frame(el, { ...opts, title: opts.title || "Average R by segment", description: "Hatching marks fewer than 30 trades: small sample. Scroll horizontally on a narrow screen; the table has every value." }, ["Segment", "Trades", "Average R", "Sample warning"], data.map((d) => [d.name, d.n, signed(d.avg_r, "R"), d.n < 30 ? "Small sample" : ""]));
  plot.classList.add("scroll-plot"); plot.tabIndex = 0; plot.role = "region"; plot.setAttribute("aria-label", "Segment bars; scroll horizontally on narrow screens");
  const root = svg("svg", { viewBox: `0 0 600 ${Math.max(1, data.length) * 48 + 30}`, role: "group", "aria-label": "Average R with sample counts" }), hatch = hatching(root);
  const domain = extent([...data.map((d) => d.avg_r), -0.1, .1], true), x = scale(domain, [155, 455]), nodes = [];
  root.append(svg("line", { x1: x(0), x2: x(0), y1: 14, y2: data.length * 48 + 24, stroke: "var(--wire)" }));
  data.forEach((d, i) => {
    const y = 18 + i * 48, label = `${d.name}: ${signed(d.avg_r, "R")}, n=${d.n}${d.n < 30 ? ", small sample" : ""}`;
    root.append(svg("text", { x: 2, y: y + 16, class: "chart-axis" }, d.name));
    const rect = svg("rect", { x: Math.min(x(0), x(d.avg_r)), y, width: Math.max(1, Math.abs(x(d.avg_r) - x(0))), height: 24, fill: d.n < 30 ? hatch : d.avg_r < 0 ? "var(--bear-wash)" : "var(--bull-wash)", stroke: d.avg_r < 0 ? "var(--bear)" : "var(--bull)", tabindex: "0", role: "img", "aria-label": label, "data-tooltip": label });
    root.append(rect, svg("text", { x: 468, y: y + 14, class: "chart-axis" }, `${signed(d.avg_r, "R")} · n=${d.n}`));
    if (d.n < 30) root.append(svg("text", { x: 468, y: y + 30, class: "chart-axis" }, "Small sample"));
    nodes.push(rect);
  });
  plot.append(root); remember(el, connectTooltip(nodes)); return { destroy: () => release(el) };
}
export function renderComparison(el, data, opts) {
  release(el);
  const metrics = [["Win rate", "win_rate", "%"], ["Average R", "avg_r", "R"], ["Net / daily drawdown", "net_dd", ""]];
  const { plot } = frame(el, { ...opts, title: "In sample vs out of sample", description: "Separate partitions of the selected exported trades. Small samples can be unstable. Undefined net/drawdown ratios are not plotted." }, ["Measure", "In sample", "Out of sample"], metrics.map(([label, key, unit]) => [label, ...data.map((d) => d.stats[key] === null ? "Undefined" : number(d.stats[key] * (unit === "%" ? 100 : 1)) + unit)]));
  const cleanup = observe(plot, () => {
    const width = Math.max(180, plot.clientWidth), root = svg("svg", { viewBox: `0 0 ${width} 240`, role: "group", "aria-label": "Paired sample comparisons" }), values = [];
    metrics.forEach(([label, key, unit], index) => {
      const domain = extent(data.map((d) => d.stats[key]).filter((v) => v !== null), true), x = scale(domain, [16, width - 16]), y = index * 76 + 40;
      root.append(svg("text", { class: "chart-axis", x: 4, y: y - 22 }, label));
      root.append(svg("line", { x1: 16, x2: width - 16, y1: y, y2: y, stroke: "var(--wire-faint)" }));
      data.forEach((d) => {
        if (d.stats[key] === null) return;
        const color = d.sample === "out" ? "var(--signal)" : "var(--ink)", value = d.stats[key];
        const text = `${d.sample === "out" ? "Out" : "In"}: ${number(value * (unit === "%" ? 100 : 1))}${unit} (n=${d.stats.trades})`;
        root.append(svg("text", { class: "chart-axis", x: d.sample === "out" ? width - 4 : 4, y: y + (d.sample === "out" ? 30 : 17), "text-anchor": d.sample === "out" ? "end" : "start" }, text));
        values.push({ x: x(value), y, label: text, fill: color });
      });
    });
    plot.replaceChildren(root); return points(root, values);
  });
  remember(el, cleanup); return { destroy: () => release(el) };
}
