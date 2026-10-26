import { frame, axes, extent, svg, node, observe, time, number, scale, release, remember } from "./core.js";
import { connectTooltip } from "../components.js";
const readout = ([t, o, h, l, c, v]) => `${time(t)} ET · O ${number(o)} · H ${number(h)} · L ${number(l)} · C ${number(c)} · volume ${number(v, 0)}`;
export function destroy(el) { release(el); }
export function render(el, data, opts) {
  destroy(el);
  const bars = data.bars, cursor = Math.min(bars.length - 1, opts.cursor ?? bars.length - 1);
  const shown = bars.slice(0, cursor + 1), now = shown.at(-1)?.[0] ?? 0;
  const readouts = shown.map(readout);
  const { plot, figure } = frame(el, { ...opts, title: opts.title || "Session · five-minute bars" }, ["Time (ET)", "Open", "High", "Low", "Close", "Volume"], shown.map((bar) => [time(bar[0]), ...bar.slice(1).map((v) => number(v))]));
  const labels = node("ul", { class: "legend-inline chart-direct-labels" });
  labels.append(node("li", {}, "Up: hollow"), node("li", {}, "Down: filled"));
  (data.windows || []).forEach((window) => labels.append(node("li", {}, `${window.name}: ${time(window.from)}–${time(window.to)} ET`)));
  figure.insertBefore(labels, figure.querySelector(".data-table"));
  const levelRows = (data.levels || []).filter((level) => !level.from || level.from <= now).map((level) => ({ ...level, className: "chart-level" }));
  const trades = (data.trades || []).filter((trade) => Date.parse(trade.opened) / 1000 <= now);
  const plans = trades.flatMap((trade) => [{ name: `Entry #${trade.id}`, price: trade.entry, className: "chart-entry" }, { name: `Stop #${trade.id}`, price: trade.stop, className: "chart-stop" }, { name: `Target #${trade.id}`, price: trade.t1, className: "chart-target" }].map((level) => ({ ...level, from: Date.parse(trade.opened) / 1000, to: Date.parse(trade.closed) / 1000 })));
  [...levelRows, ...plans].forEach((level) => labels.append(node("li", {}, `${level.name}: ${number(level.price)}`)));
  const cleanup = observe(plot, () => {
    const [low, high] = extent([...bars.flatMap((b) => [b[2], b[3]]), ...(data.levels || []).map((l) => l.price), ...(data.trades || []).flatMap((t) => [t.stop, t.t1, t.entry, t.exit])]);
    const span = high - low;
    const a = axes(plot, extent(bars.map((b) => b[0])), [low - span * .08, high + span * .08], { xLabel: (v) => time(v), label: "Candles in price points" });
    const slot = (a.width - a.margin.left - a.margin.right) / Math.max(1, bars.length);
    // Centers stay inside the frame, including a single-bar session.
    const x = scale([0, Math.max(1, bars.length - 1)], [a.margin.left + slot / 2, a.width - a.margin.right - slot / 2]);
    const at = (stamp) => {
      const index = bars.findIndex((b) => b[0] === stamp);
      return index < 0 ? a.x(stamp) : x(index);
    };
    const overlays = svg("g", { class: "trade-overlays" });
    for (const window of data.windows || []) {
      const start = Math.max(bars[0]?.[0] || 0, window.from), end = Math.min(bars.at(-1)?.[0] || 0, window.to);
      if (end <= start) continue;
      overlays.append(svg("rect", { x: at(start), y: a.margin.top, width: Math.max(0, at(end) - at(start)), height: a.height - a.margin.top - a.margin.bottom, fill: "var(--signal-wash)", stroke: "var(--wire)", "stroke-dasharray": "3 4" }));
      if (at(end) - at(start) > window.name.length * 8) overlays.append(svg("text", { x: at(start) + 4, y: a.margin.top + 13, class: "chart-axis" }, window.name));
    }
    for (const trade of trades) {
      const start = at(Date.parse(trade.opened) / 1000), end = at(Math.min(now, Date.parse(trade.closed) / 1000));
      for (const [className, price] of [["risk-zone", trade.stop], ["reward-zone", trade.t1]]) overlays.append(svg("rect", { class: className, x: start, y: Math.min(a.y(price), a.y(trade.entry)), width: Math.max(0, end - start), height: Math.abs(a.y(price) - a.y(trade.entry)) }));
      if (Date.parse(trade.closed) / 1000 <= now) overlays.append(svg("path", { class: "wire-path trade-path", d: `M${start},${a.y(trade.entry)}L${end},${a.y(trade.exit)}`, "data-entry-x": start, "data-entry-y": a.y(trade.entry), "data-exit-x": end, "data-exit-y": a.y(trade.exit) }));
    }
    for (const level of [...levelRows, ...plans]) overlays.append(svg("line", { class: level.className, x1: level.from ? at(level.from) : a.margin.left, x2: level.to ? at(Math.min(now, level.to)) : a.width - a.margin.right, y1: a.y(level.price), y2: a.y(level.price) }));
    a.root.append(overlays);
    if (bars.length < 300) {
      const points = [], events = new AbortController();
      const cross = svg("g", { class: "chart-crosshair", "pointer-events": "none" });
      const vertical = svg("line", { y1: a.margin.top, y2: a.height - a.margin.bottom, stroke: "var(--wire)", "stroke-dasharray": "3 3" });
      const horizontal = svg("line", { x1: a.margin.left, x2: a.width - a.margin.right, stroke: "var(--wire)", "stroke-dasharray": "3 3" });
      cross.append(vertical, horizontal); cross.style.visibility = "hidden";
      shown.forEach((bar, i) => {
        const [t, o, h, l, c] = bar;
        const group = svg("g", { class: `candle${c < o ? " down" : ""}`, tabindex: "0", role: "img", "aria-label": readouts[i], "data-tooltip": readouts[i], "data-time": t, "data-x": x(i), "data-close-y": a.y(c) });
        group.append(svg("line", { x1: x(i), x2: x(i), y1: a.y(h), y2: a.y(l) }), svg("rect", { x: x(i) - slot * .3, y: Math.min(a.y(o), a.y(c)), width: Math.max(.4, slot * .6), height: Math.max(1, Math.abs(a.y(o) - a.y(c))) }));
        const reveal = () => { vertical.setAttribute("x1", x(i)); vertical.setAttribute("x2", x(i)); horizontal.setAttribute("y1", a.y(c)); horizontal.setAttribute("y2", a.y(c)); cross.style.visibility = "visible"; };
        const hide = () => { if (document.activeElement !== group) cross.style.visibility = "hidden"; };
        for (const event of ["focus", "pointerenter"]) group.addEventListener(event, reveal, { signal: events.signal });
        for (const event of ["blur", "pointerleave"]) group.addEventListener(event, hide, { signal: events.signal });
        a.root.append(group); points.push(group);
      });
      a.root.append(cross);
      const disconnect = connectTooltip(points);
      return () => { disconnect(); events.abort(); };
    }
    const canvas = node("canvas", { class: "candle-canvas", tabindex: "0", role: "img", "aria-label": "Dense candles. Use left and right arrows to inspect exported bars." });
    const dpr = devicePixelRatio || 1;
    canvas.width = a.width * dpr; canvas.height = a.height * dpr;
    canvas.style.width = "100%"; canvas.style.height = a.height + "px";
    plot.append(canvas);
    const ctx = canvas.getContext("2d"), style = getComputedStyle(plot);
    ctx.scale(dpr, dpr);
    let active = 0;
    function draw() {
      ctx.clearRect(0, 0, a.width, a.height);
      shown.forEach((bar, i) => {
        const [, o, h, l, c] = bar;
        ctx.strokeStyle = style.getPropertyValue(c < o ? "--bear" : "--bull").trim(); ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x(i), a.y(h)); ctx.lineTo(x(i), a.y(l)); ctx.stroke();
        const rect = [x(i) - slot * .3, Math.min(a.y(o), a.y(c)), Math.max(.4, slot * .6), Math.max(1, Math.abs(a.y(o) - a.y(c)))];
        if (c < o) ctx.fillRect(...rect); else ctx.strokeRect(...rect);
      });
      if (shown[active]) {
        ctx.strokeStyle = style.getPropertyValue("--ink").trim();
        ctx.beginPath(); ctx.moveTo(x(active), a.margin.top); ctx.lineTo(x(active), a.height - a.margin.bottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.margin.left, a.y(shown[active][4])); ctx.lineTo(a.width - a.margin.right, a.y(shown[active][4])); ctx.stroke();
        canvas.dataset.tooltip = readouts[active];
        canvas.setAttribute("aria-label", readouts[active]);
      }
    }
    const select = () => { draw(); canvas.dispatchEvent(new FocusEvent("focus")); };
    const keyboard = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      active = event.key === "Home" ? 0 : event.key === "End" ? shown.length - 1 : Math.max(0, Math.min(shown.length - 1, active + (event.key === "ArrowRight" ? 1 : -1)));
      select();
    };
    const pointer = (event) => {
      const rect = canvas.getBoundingClientRect();
      const local = (event.clientX - rect.left) / rect.width * a.width;
      active = Math.max(0, Math.min(shown.length - 1, Math.round((local - x(0)) / Math.max(.1, x(1) - x(0)))));
      draw();
    };
    canvas.addEventListener("keydown", keyboard);
    canvas.addEventListener("pointermove", pointer);
    const disconnect = connectTooltip([canvas]); draw();
    // Parent theme changes can happen without a resize; redraw with current tokens.
    const mutation = new MutationObserver(() => {
      const current = getComputedStyle(plot);
      // getComputedStyle is live in browsers; draw reads its current custom properties.
      if (current) draw();
    });
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = matchMedia("(prefers-color-scheme:dark)");
    scheme.addEventListener("change", draw);
    return () => { disconnect(); mutation.disconnect(); scheme.removeEventListener("change", draw); canvas.removeEventListener("keydown", keyboard); canvas.removeEventListener("pointermove", pointer); canvas.remove(); };
  });
  remember(el, cleanup); return { destroy: () => destroy(el) };
}
