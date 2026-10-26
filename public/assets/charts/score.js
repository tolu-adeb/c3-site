import { frame, svg, number, release, remember } from "./core.js";
import { connectTooltip } from "../components.js";
export const destroy = release;
export function render(el, data, opts) {
  release(el);
  const { plot } = frame(el, { ...opts, title: "Exported score and gates", description: data?.score === undefined ? "No exported score at this bar." : `Score ${number(data.score)} of 100. ${data.threshold === undefined ? "Threshold not exported." : `Exported threshold ${number(data.threshold)}.`} Gate symbols show the recorded pass/fail state.` }, ["Gate", "Recorded verdict"], (data?.gates || []).map((gate) => [gate.name, gate.pass ? "Pass" : "Fail"]));
  if (data?.score === undefined) return { destroy: () => release(el) };
  const root = svg("svg", { viewBox: "0 0 220 220", role: "group", "aria-label": `Exported score ${data.score} of 100` }), points = [];
  root.append(svg("path", { d: "M25 105A85 85 0 0 1 195 105", fill: "none", stroke: "var(--wire)", "stroke-width": 1 }));
  const angle = (score) => Math.PI + Math.max(0, Math.min(100, score)) / 100 * Math.PI;
  const end = angle(data.score), x = 110 + Math.cos(end) * 85, y = 105 + Math.sin(end) * 85;
  root.append(svg("path", { d: `M25 105A85 85 0 ${data.score > 100 ? 1 : 0} 1 ${x} ${y}`, fill: "none", stroke: "var(--signal)", "stroke-width": 3 }));
  root.append(svg("text", { x: 110, y: 91, "text-anchor": "middle", fill: "var(--ink)", "font-family": "var(--mono)", "font-size": 32 }, number(data.score)));
  root.append(svg("text", { x: 110, y: 111, "text-anchor": "middle", class: "chart-axis" }, "of 100"));
  if (data.threshold !== undefined) {
    const a = angle(data.threshold), label = `Exported score threshold ${data.threshold}`;
    const marker = svg("line", { x1: 110 + Math.cos(a) * 77, y1: 105 + Math.sin(a) * 77, x2: 110 + Math.cos(a) * 94, y2: 105 + Math.sin(a) * 94, stroke: "var(--ink)", "stroke-width": 2, tabindex: "0", role: "img", "aria-label": label, "data-tooltip": label });
    root.append(marker); points.push(marker);
  }
  (data.gates || []).forEach((gate, i) => {
    const x = 12 + i % 6 * 34, y = 142 + Math.floor(i / 6) * 36, label = `${gate.name}: ${gate.pass ? "pass" : "fail"}`;
    const group = svg("g", { tabindex: "0", role: "img", "aria-label": label, "data-tooltip": label });
    group.append(svg("rect", { x, y, width: 27, height: 27, fill: gate.pass ? "var(--bull-wash)" : "var(--bear-wash)", stroke: gate.pass ? "var(--bull)" : "var(--bear)" }));
    group.append(svg("text", { x: x + 13.5, y: y + 19, "text-anchor": "middle", fill: "var(--ink)", "font-size": 18 }, gate.pass ? "✓" : "×"));
    root.append(group); points.push(group);
  });
  plot.append(root); remember(el, connectTooltip(points)); return { destroy: () => release(el) };
}
