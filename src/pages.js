// Insert an exported public summary so the table remains readable without JS.
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export async function backtestPage(request, env) {
  const url = new URL(request.url), headers = new Headers(request.headers);
  headers.delete("if-none-match"); headers.delete("if-modified-since");
  const response = await env.ASSETS.fetch(new Request(request, { headers }));
  if (response.status !== 200 || !env.DATA || env.BACKTESTS_PUBLIC !== "true" || url.searchParams.has("staging") || url.searchParams.has("preview")) return response;
  const pointer = await env.DATA.get("live/current.json");
  if (!pointer) return response;
  const { bundle } = await pointer.json(), prefix = `live/${bundle}/`;
  const object = await env.DATA.get(prefix + "manifest.json");
  if (!object) return response;
  const manifest = await object.json(), run = url.searchParams.get("run") || manifest.featured.run;
  if (!manifest.runs.includes(run)) return response;
  const stored = await env.DATA.get(prefix + `runs/${run}/summary.json`);
  if (!stored) return response;
  const summary = await stored.json();
  if (!["backtest", "walk_forward"].includes(summary.kind)) return response;
  const fmt = (value, suffix = "") => Number.isFinite(value) ? esc(value.toLocaleString("en-US", { maximumFractionDigits: 2 })) + suffix : "—";
  const pnl = (value, suffix = "") => (value > 0 ? "+" : value < 0 ? "−" : "") + fmt(Math.abs(value), suffix);
  const rows = [["Run", esc(summary.run_id)], ["Data source", esc(summary.dataset.source)], ["Sample", "In + out of sample"], ["Sessions", esc(summary.dataset.start + "–" + summary.dataset.end)], ["Closed trades", fmt(summary.stats.trades)], ["Win rate", fmt(summary.stats.win_rate * 100, "%")], ["Average R", pnl(summary.stats.avg_r, "R")], ["Net after costs (USD / micro)", pnl(summary.stats.net_usd)], ["Maximum daily drawdown (USD)", pnl(-summary.stats.max_dd_usd)], ["Costs", esc(`$${summary.costs.commission_rt_usd} RT / ${summary.costs.contract}; ${summary.costs.entry_slip_ticks}-tick entry, ${summary.costs.stop_slip_ticks}-tick stop slippage`)]];
  let html = `<h2>Full-run summary</h2><p>${manifest.synthetic ? "Synthetic fixture values. " : "Hypothetical backtest results. "}Client filters apply to the enhanced view below.</p><div class="scroll"><table class="tbl"><caption>${esc(summary.label)}</caption><thead><tr><th scope="col">Measure</th><th scope="col">Value</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><th scope="row">${label}</th><td>${value}</td></tr>`).join("")}</tbody></table></div><a class="source" href="/methodology/#data">${esc(summary.run_id)} · ${esc(summary.dataset.source)} · in + out of sample · Methodology</a>`;
  const tradeFile = await env.DATA.get(prefix + `runs/${run}/trades.json`);
  if (tradeFile) {
    const trades = await tradeFile.json(), pages = Math.max(1, Math.ceil(trades.length / 100));
    const requested = Number(url.searchParams.get("table_page")) || 1, page = Math.max(1, Math.min(pages, Math.floor(requested)));
    const selection = trades.slice((page - 1) * 100, page * 100);
    html += `<section id="static-trades"><h2>Exported trades · full run</h2><p>Page ${page} of ${pages}. Client filters apply only to the enhanced view.</p><div class="scroll" tabindex="0" role="region" aria-label="Exported full-run trades"><table class="tbl"><caption>${esc(run)} · ${esc(summary.dataset.source)} · in + out of sample · after documented costs</caption><thead><tr><th scope="col">Session</th><th scope="col">Setup</th><th scope="col">Side</th><th scope="col">Net R</th><th scope="col">Net USD</th><th scope="col">Exit</th><th scope="col">Sample</th></tr></thead><tbody>${selection.map((trade) => `<tr><th scope="row"><a href="/replay/?run=${encodeURIComponent(run)}&amp;day=${encodeURIComponent(trade.date)}">${esc(trade.date)}</a></th><td>${esc(trade.setup)}</td><td>${esc(trade.side)}</td><td>${pnl(trade.r, "R")}</td><td>${pnl(trade.usd)}</td><td>${esc(trade.exit_reason)}</td><td>${trade.sample === "out" ? "Out of sample" : "In sample"}</td></tr>`).join("")}</tbody></table></div><nav aria-label="Full-run trade pages">${Array.from({ length: pages }, (_, i) => `<a href="?run=${encodeURIComponent(run)}&amp;table_page=${i + 1}#static-trades"${i + 1 === page ? ' aria-current="page"' : ""}>Page ${i + 1}</a>`).join(" · ")}</nav><a class="source" href="/methodology/#costs">${esc(run)} · ${esc(summary.dataset.source)} · in + out of sample · Methodology</a></section>`;
  }
  const result = new HTMLRewriter().on("#static-summary", { element(element) { element.setInnerContent(html, { html: true }); } }).transform(response);
  result.headers.set("cache-control", "no-store");
  result.headers.delete("etag"); result.headers.delete("last-modified");
  return result;
}

export async function strategyPage(request, env) {
  const headers = new Headers(request.headers); headers.delete("if-none-match"); headers.delete("if-modified-since");
  const response = await env.ASSETS.fetch(new Request(request, { headers })), url = new URL(request.url);
  if (response.status !== 200 || !env.DATA || env.BACKTESTS_PUBLIC !== "true" || url.searchParams.has("staging") || url.searchParams.has("preview")) return response;
  const pointer = await env.DATA.get("live/current.json"); if (!pointer) return response;
  const { bundle } = await pointer.json(), object = await env.DATA.get(`live/${bundle}/strategies.json`);
  if (!object) return response;
  const strategies = await object.json(), id = url.pathname.split("/").filter(Boolean)[1];
  const source = `<a class="source" href="/methodology/#data">Bundle ${esc(bundle)} · exported strategy descriptions · states are not performance · Methodology</a>`;
  const labels = { live: "Live", paper: "Paper", research: "Research", retired: "Retired", in_build: "In build" };
  let rewriter = new HTMLRewriter();
  if (!id || id === "index.html") {
    const html = `<div class="scroll"><table class="tbl"><caption>Published strategy states</caption><thead><tr><th scope="col">Strategy</th><th scope="col">State</th><th scope="col">Description / limit</th></tr></thead><tbody>${strategies.map((s) => `<tr><th scope="row"><a href="/strategies/${esc(s.id)}/">${esc(s.name)}</a></th><td>${esc(labels[s.state])}</td><td>${esc(s.retired_reason || s.one_line)}</td></tr>`).join("")}</tbody></table></div>${source}`;
    rewriter = rewriter.on("#strategy-cards", { element(element) { element.setInnerContent(html, { html: true }); } });
  } else {
    const strategy = strategies.find((s) => s.id === id); if (!strategy) return response;
    const list = (title, values) => `<h2>${title}</h2>${values.length ? `<ul>${values.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>` : "<p>Not published.</p>"}`;
    const html = `<p><strong>${esc(labels[strategy.state])}</strong></p>${strategy.retired_reason ? `<p>Retired: ${esc(strategy.retired_reason)}</p>` : ""}<h2>Mechanism</h2><p>${esc(strategy.mechanism)}</p>${list("Rules", strategy.rules)}${list("Exits", strategy.exits)}${list("Filters", strategy.filters)}<h2>Scoring</h2><p>${esc(strategy.scoring)}</p>${strategy.state === "in_build" ? "<p>Theory only. No performance results are shown.</p>" : strategy.runs.length ? `<a href="/backtests/?run=${encodeURIComponent(strategy.runs[0])}">Read the exported full-run summary and trades</a>` : ""}${source}`;
    rewriter = rewriter.on("#strategy-theory", { element(element) { element.setInnerContent(html, { html: true }); } }).on("#page-title", { element(element) { element.setInnerContent(strategy.name); } });
  }
  rewriter = rewriter.on("#data-status", { element(element) { element.setInnerContent("Published strategy descriptions. The data source and limits are labeled below."); } });
  const result = rewriter.transform(response); result.headers.set("cache-control", "no-store"); result.headers.delete("etag"); result.headers.delete("last-modified"); return result;
}
