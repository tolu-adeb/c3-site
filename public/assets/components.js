// Shared instrument controls. Values come from exported rows; no strategy runs here.
let tooltip;
function tooltipNode() {
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.id = "instrument-tooltip";
    tooltip.role = "tooltip";
    tooltip.hidden = true;
    document.body.append(tooltip);
  }
  return tooltip;
}

export function connectTooltip(points) {
  const nodes = [...points];
  const controller = new AbortController();
  const on = (el, event, fn) => el.addEventListener(event, fn, { signal: controller.signal });
  let active;
  function hide() {
    if (active) active.removeAttribute("aria-describedby");
    active = null;
    tooltipNode().hidden = true;
  }
  function show(node, x, y) {
    const tip = tooltipNode();
    if (active && active !== node) active.removeAttribute("aria-describedby");
    active = node;
    const theme = node.closest("[data-theme]")?.dataset.theme;
    if (theme) tip.dataset.theme = theme; else tip.removeAttribute("data-theme");
    tip.textContent = node.dataset.tooltip;
    tip.hidden = false;
    node.setAttribute("aria-describedby", tip.id);
    const box = tip.getBoundingClientRect();
    const left = x + 16 + box.width > innerWidth - 12 ? x - box.width - 16 : x + 16;
    const top = y + 20 + box.height > innerHeight - 12 ? y - box.height - 20 : y + 20;
    tip.style.left = Math.max(12, Math.min(left, innerWidth - box.width - 12)) + "px";
    tip.style.top = Math.max(12, top) + "px";
  }
  for (const [index, node] of nodes.entries()) {
    on(node, "pointerenter", (event) => show(node, event.clientX, event.clientY));
    on(node, "pointermove", (event) => show(node, event.clientX, event.clientY));
    on(node, "pointerleave", () => {
      if (document.activeElement !== node) hide();
    });
    on(node, "focus", () => {
      const box = node.getBoundingClientRect();
      show(node, box.right, box.bottom);
    });
    on(node, "blur", hide);
    on(node, "keydown", (event) => {
      if (event.key === "Escape") hide();
      const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      const next = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : delta ? index + delta : null;
      if (next !== null) {
        event.preventDefault();
        nodes[Math.max(0, Math.min(nodes.length - 1, next))].focus();
      }
    });
  }
  on(window, "scroll", hide);
  on(window, "resize", hide);
  return () => { hide(); controller.abort(); };
}

export function enhanceTables(root = document) {
  // The authored table is open with JS off. Native details handles keyboard toggling.
  root.querySelectorAll("details[data-table]").forEach((details) => { details.open = false; });
}
