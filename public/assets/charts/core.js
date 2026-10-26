import { connectTooltip } from "../components.js";

export function node(tag, attrs = {}, text) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}
export function svg(tag, attrs = {}, text) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}
const numberFormats = new Map();
export function number(value, digits = 2) {
  if (!numberFormats.has(digits)) numberFormats.set(digits, new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }));
  return numberFormats.get(digits).format(value);
}
export const signed = (value, suffix = "") => `${value > 0 ? "+" : value < 0 ? "−" : ""}${number(Math.abs(value))}${suffix}`;
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
export const time = (unix) => timeFormat.format(unix * 1000);
export function extent(values, zero = false) {
  let low = Math.min(...values), high = Math.max(...values);
  if (!values.length) return [0, 1];
  if (zero) { low = Math.min(0, low); high = Math.max(0, high); }
  if (low === high) { low -= 1; high += 1; }
  return [low, high];
}
export function scale([a, b], [c, d]) {
  const span = b - a;
  return (value) => span ? c + (value - a) / span * (d - c) : (c + d) / 2;
}
export function sourceText(meta) {
  if (!meta?.run_id || !meta?.source || !meta?.sample) throw new Error("Charts need run_id, source and sample metadata");
  return [meta.run_id, meta.source, meta.sample, meta.range, meta.costs].filter(Boolean).join(" · ");
}
export function sourceLink(meta) {
  let href = meta.methodology || "/methodology/#data";
  const params = new URLSearchParams(location.search);
  if (params.has("staging") || params.get("preview") === "current") {
    const url = new URL(href, location.href);
    if (params.has("staging")) url.searchParams.set("staging", params.get("staging")); else url.searchParams.set("preview", "current");
    href = url.pathname + url.search + url.hash;
  }
  return node("a", { class: "source", href }, sourceText(meta) + " · Methodology");
}
export function table(columns, rows, title) {
  const details = node("details", { class: "data-table", "data-table": "" });
  details.append(node("summary", {}, "Data table"));
  const region = node("div", { class: "scroll", role: "region", "aria-label": title + " data", tabindex: "0" });
  const table = node("table", { class: "tbl" });
  table.append(node("caption", {}, title));
  const head = node("thead"), tr = node("tr");
  columns.forEach((label) => tr.append(node("th", { scope: "col" }, label)));
  head.append(tr);
  const body = node("tbody");
  for (const row of rows) {
    const tr = node("tr");
    row.forEach((value, index) => tr.append(node(index ? "td" : "th", index ? {} : { scope: "row" }, value)));
    body.append(tr);
  }
  table.append(head, body); region.append(table); details.append(region);
  return details;
}
export function frame(el, opts, columns, rows) {
  const figure = node("figure", { class: "fig chart", "aria-label": opts.title });
  const head = node("div", { class: "fig-head" });
  head.append(node("span", { class: "fig-index" }, opts.title), node("span", { class: "chip state", "data-state": opts.state || "backtest" }, opts.meta.source.toLowerCase().includes("synthetic") ? "Synthetic illustration" : opts.state || "Backtest"));
  const plot = node("div", { class: "fig-plot" });
  const caption = node("figcaption");
  if (opts.description) caption.append(node("p", {}, opts.description));
  caption.append(sourceLink(opts.meta));
  figure.append(head, plot, table(columns, rows, opts.title), caption);
  el.replaceChildren(figure);
  return { figure, plot, caption };
}
export function axes(plot, xDomain, yDomain, opts = {}) {
  const width = Math.max(120, plot.clientWidth), height = opts.height || 240;
  const margin = { left: opts.compact ? 4 : 56, right: opts.right || 16, top: 18, bottom: opts.compact ? 4 : 36 };
  const x = scale(xDomain, [margin.left, width - margin.right]);
  const y = scale(yDomain, [height - margin.bottom, margin.top]);
  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": opts.label || "Chart" });
  if (!opts.compact) {
    for (let i = 0; i < 4; i++) {
      const value = yDomain[0] + (yDomain[1] - yDomain[0]) * i / 3;
      root.append(svg("line", { x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), stroke: "var(--wire-faint)" }));
      root.append(svg("text", { class: "chart-axis", x: margin.left - 8, y: y(value) + 4, "text-anchor": "end" }, number(value, 1)));
    }
    const xTicks = width < 360 ? 1 : 2;
    for (let i = 0; i <= xTicks; i++) {
      const value = xDomain[0] + (xDomain[1] - xDomain[0]) * i / xTicks;
      root.append(svg("line", { x1: x(value), x2: x(value), y1: margin.top, y2: height - margin.bottom, stroke: "var(--wire-faint)" }));
      root.append(svg("text", { class: "chart-axis", x: x(value), y: height - 10, "text-anchor": i === 0 ? "start" : i === xTicks ? "end" : "middle" }, opts.xLabel ? opts.xLabel(value) : number(value)));
    }
  }
  plot.replaceChildren(root);
  return { root, width, height, margin, x, y };
}
export function observe(plot, draw) {
  let cleanup = () => {}, raf;
  const render = () => { cleanup(); cleanup = draw() || (() => {}); };
  render();
  let width = plot.clientWidth;
  const observer = new ResizeObserver(() => {
    if (plot.clientWidth === width) return;
    width = plot.clientWidth; cancelAnimationFrame(raf); raf = requestAnimationFrame(render);
  });
  observer.observe(plot);
  return () => { cancelAnimationFrame(raf); observer.disconnect(); cleanup(); };
}
export function points(root, values) {
  const nodes = values.map(({ x, y, label, fill = "var(--ink)" }) => {
    const point = svg("circle", { cx: x, cy: y, r: 3, fill, tabindex: "0", role: "img", "aria-label": label, "data-tooltip": label, class: "chart-point" });
    root.append(point); return point;
  });
  return connectTooltip(nodes);
}
export function lazy(el, render) {
  if (!("IntersectionObserver" in window)) return render();
  let chart;
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect(); chart = render();
  }, { rootMargin: "200px" });
  observer.observe(el);
  return { destroy() { observer.disconnect(); chart?.destroy(); } };
}

// One lifetime per host, including when callers switch chart types.
const lifetimes = new WeakMap();
export function release(el) { lifetimes.get(el)?.(); lifetimes.delete(el); }
export function remember(el, cleanup) { lifetimes.set(el, cleanup); }
