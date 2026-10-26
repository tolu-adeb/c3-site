import { loadBundle, dataLink } from "./data.js";
import { node, sourceLink } from "./charts/core.js";
import { render } from "./charts/schematic.js";
const status = document.getElementById("data-status");
document.getElementById("main").setAttribute("aria-busy", "true");
try {
  const response = await fetch("/assets/engine.json");
  if (!response.ok) throw new Error("Engine description is unavailable.");
  let data = await response.json(), meta = { run_id: "NQ build specification", source: "Static process description", sample: "Theory only; no performance", methodology: "/methodology/#engine" };
  try {
    const bundle = await loadBundle();
    const exported = bundle.manifest.files.some((f) => f.path === "engine.json");
    if (exported) {
      data = await bundle.read("engine.json");
      meta = { run_id: `Bundle ${bundle.manifest.bundle}`, source: "Exported engine description", sample: bundle.manifest.synthetic ? "Synthetic illustration" : "Process description; no performance", range: bundle.manifest.generated_at, methodology: "/methodology/#engine" };
    }
    status.textContent = !exported ? "No engine description was exported. The static process description is shown below." : bundle.manifest.synthetic ? "Synthetic exported process specimen. No operational or performance state is inferred." : "Published process description. A node’s state is shown only when exported.";
  } catch (error) { status.textContent = error.status === 404 ? "Results not published yet. The static process description is shown below." : error.message; }
  const list = document.getElementById("engine-list"); list.replaceChildren();
  data.nodes.forEach((entry) => {
    const li = node("li", { "data-node-list": entry.id });
    li.append(node("h3", {}, entry.name), node("p", {}, entry.text), node("a", { href: dataLink(entry.href) }, entry.spec_section)); list.append(li);
  });
  render(document.getElementById("engine-schematic"), data, { meta, panel: document.getElementById("engine-panel") });
  document.getElementById("engine-list-source").replaceChildren(sourceLink(meta));
} catch (error) { status.textContent = error.message; }
finally { document.getElementById("main").setAttribute("aria-busy", "false"); }
