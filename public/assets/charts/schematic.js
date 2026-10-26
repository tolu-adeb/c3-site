import { frame, node, svg, release, remember } from "./core.js";
import { dataLink } from "../data.js";
export const destroy = release;
export function render(el, data, opts) {
  release(el);
  const { plot } = frame(el, { ...opts, title: "Engine / recorded pipeline", state: "illustration", description: "Focus or hover a node to inspect its inputs, outputs and recorded state. Arrows move in pipeline order; Home and End jump to the ends. The diagram scrolls horizontally on a narrow screen." }, ["Node", "Spec", "Inputs", "Outputs", "Recorded state"], data.nodes.map((n) => [n.name, n.spec_section, n.inputs.join(", "), n.outputs.join(", "), n.state || "Not exported"]));
  plot.classList.add("scroll-plot", "schematic-plot"); plot.tabIndex = 0; plot.role = "region"; plot.setAttribute("aria-label", "Engine schematic; scroll to inspect all nodes");
  const root = svg("svg", { viewBox: "0 0 900 850", role: "group", "aria-label": "Read-only engine pipeline" });
  const coords = new Map(data.nodes.map((n, i) => {
    const row = Math.floor(i / 3), col = row % 2 ? 2 - i % 3 : i % 3;
    return [n.id, { x: 150 + col * 300, y: 100 + row * 190 }];
  }));
  const edges = data.edges.filter((edge) => coords.has(edge.from) && coords.has(edge.to)).map((edge) => {
    const a = coords.get(edge.from), b = coords.get(edge.to), middle = (a.y + b.y) / 2 + 15;
    const path = svg("path", { d: `M${a.x},${a.y + 66}L${a.x},${middle}L${b.x},${middle}L${b.x},${b.y - 40}`, class: "schematic-edge" });
    root.append(path); return { edge, path };
  });
  const groups = [], events = new AbortController();
  function select(index) {
    const selected = data.nodes[index], active = new Set();
    function ancestors(id) { if (active.has(id)) return; active.add(id); data.edges.filter((e) => e.to === id).forEach((e) => ancestors(e.from)); }
    ancestors(selected.id);
    edges.forEach(({ edge, path }) => path.classList.toggle("active", active.has(edge.from) && active.has(edge.to)));
    groups.forEach((g, i) => { g.classList.toggle("active", active.has(data.nodes[i].id)); g.setAttribute("aria-pressed", String(i === index)); });
    const panel = opts.panel;
    if (panel) {
      const list = node("dl", { class: "kv" });
      for (const [label, value] of [["Inputs", selected.inputs.join(", ")], ["Outputs", selected.outputs.join(", ")], ["Recorded state", selected.state || "No last-run state exported"]]) list.append(node("dt", {}, label), node("dd", {}, value));
      panel.replaceChildren(node("h2", {}, selected.name), node("p", {}, selected.text), node("a", { href: dataLink(selected.href) }, `Read ${selected.spec_section}`), list);
    }
  }
  data.nodes.forEach((entry, i) => {
    const { x, y } = coords.get(entry.id), g = svg("g", { class: "schematic-node", tabindex: "0", role: "button", "aria-label": `${i + 1}. ${entry.name}, ${entry.spec_section}`, "aria-controls": opts.panel?.id || "engine-panel", "aria-pressed": "false", "data-node": entry.id });
    // 30-degree isometric faces, with a short vertical depth.
    g.append(svg("path", { d: `M${x},${y - 40}L${x + 70},${y}L${x},${y + 40}L${x - 70},${y}ZM${x - 70},${y}V${y + 25}L${x},${y + 65}L${x + 70},${y + 25}V${y}M${x},${y + 40}V${y + 65}`, class: "schematic-box" }));
    g.append(svg("text", { x: x - 70, y: y - 56, class: "chart-axis" }, `${String(i + 1).padStart(2, "0")} / ${entry.spec_section}`));
    const words = entry.name.split(" "), line = svg("text", { x, y: y + 3, "text-anchor": "middle", class: "schematic-label" });
    if (entry.name.length > 16) { line.append(svg("tspan", { x, dy: -5 }, words.slice(0, -1).join(" ")), svg("tspan", { x, dy: 16 }, words.at(-1))); }
    else line.textContent = entry.name;
    g.append(line);
    const show = () => select(i);
    for (const event of ["pointerenter", "focus", "click"]) g.addEventListener(event, show, { signal: events.signal });
    g.addEventListener("keydown", (event) => {
      const next = event.key === "Home" ? 0 : event.key === "End" ? data.nodes.length - 1 : ["ArrowRight", "ArrowDown"].includes(event.key) ? Math.min(data.nodes.length - 1, i + 1) : ["ArrowLeft", "ArrowUp"].includes(event.key) ? Math.max(0, i - 1) : null;
      if (next !== null) { event.preventDefault(); groups[next].focus(); groups[next].scrollIntoView({ block: "nearest", inline: "nearest" }); }
      if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(i); }
    }, { signal: events.signal });
    root.append(g); groups.push(g);
  });
  plot.append(root);
  if (groups.length) select(0);
  remember(el, () => events.abort()); return { destroy: () => release(el) };
}
