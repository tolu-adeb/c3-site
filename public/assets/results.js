import { node, number, signed, sourceLink } from "./charts/core.js";
export function aggregate(trades, sessions) {
  let equity = 0, peak = 0;
  const daily = sessions.map((session) => {
    const rows = trades.filter((trade) => trade.date === session.date);
    const net_r = rows.reduce((sum, trade) => sum + trade.r, 0), net_usd = rows.reduce((sum, trade) => sum + trade.usd, 0);
    equity += net_usd; peak = Math.max(peak, equity);
    return { date: session.date, n: rows.length, net_r, net_usd, equity_usd: equity, drawdown_usd: peak - equity, sample: session.sample };
  });
  const net_r = trades.reduce((sum, trade) => sum + trade.r, 0);
  return { daily, stats: { trades: trades.length, win_rate: trades.length ? trades.filter((t) => t.r > 0).length / trades.length : 0, avg_r: trades.length ? net_r / trades.length : 0, net_r, net_usd: equity, max_dd_usd: Math.max(0, ...daily.map((d) => d.drawdown_usd)) } };
}
export function monthly(trades, sessions) {
  return [...new Set(sessions.map((d) => d.date.slice(0, 7)))].map((month) => {
    const rows = trades.filter((t) => t.date.startsWith(month));
    return { month, trades: rows.length, win_rate: rows.length ? rows.filter((t) => t.r > 0).length / rows.length : 0, net_r: rows.reduce((s, t) => s + t.r, 0), net_usd: rows.reduce((s, t) => s + t.usd, 0) };
  });
}
const entryTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
export function segments(trades, key) {
  const groups = Object.groupBy(trades, (t) => key === "opened" ? entryTime.format(new Date(t.opened)) : t[key]);
  return Object.entries(groups).map(([name, rows]) => ({ name, n: rows.length, avg_r: rows.reduce((sum, t) => sum + t.r, 0) / rows.length }));
}
export function metaFor(summary, sessions) {
  const samples = new Set(sessions.map((s) => s.sample));
  return { run_id: summary.run_id, source: summary.dataset.source, sample: samples.size > 1 ? "In + out of sample" : samples.has("out") ? "Out of sample" : samples.has("in") ? "In sample" : "No selected sessions", range: sessions.length ? `${sessions[0].date}–${sessions.at(-1).date}` : "Empty selection", costs: `$${number(summary.costs.commission_rt_usd)} RT / ${summary.costs.contract}; ${summary.costs.entry_slip_ticks}-tick entry, ${summary.costs.stop_slip_ticks}-tick stop slippage` };
}
export function statStrip(el, stats, meta, extra) {
  const dl = node("dl", { class: "stat-strip" });
  const items = [["Closed trades", number(stats.trades, 0)], ["Win rate", stats.trades ? number(stats.win_rate * 100, 1) + "%" : "No trades"], ["Average R", stats.trades ? signed(stats.avg_r, "R") : "No trades"], ["Net USD / micro", signed(stats.net_usd)], ["Daily closing drawdown", signed(-stats.max_dd_usd)], ["Out-of-sample avg R", extra === null || extra === undefined ? "No trades" : signed(extra, "R")]];
  for (const [label, value] of items) {
    const group = node("div"), source = node("dd", { class: "stat-source" });
    source.append(sourceLink(meta));
    group.append(node("dt", {}, label), node("dd", {}, value), source); dl.append(group);
  }
  el.replaceChildren(dl);
}
