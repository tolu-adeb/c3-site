// Public projection of the signed paper track push. Never substitute backtest data.
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const count = (value) => Number.isInteger(value) && value >= 0;
const text = (value, limit = 500) => typeof value === "string" && value.length <= limit;
const date = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const near = (a, b) => Math.abs(a - b) <= 1e-6;
export function paperProjection(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || data.kind && data.kind !== "paper" || data.sample && data.sample !== "paper") return null;
  const output = { sample: "paper" };
  for (const key of ["trades", "wins", "losses"]) if (count(data[key])) output[key] = data[key];
  for (const key of ["net_pts", "avg_r", "net_usd"]) if (finite(data[key])) output[key] = data[key];
  if (finite(data.win_rate) && data.win_rate >= 0 && data.win_rate <= 1) output.win_rate = data.win_rate;
  if (finite(data.max_dd_usd) && data.max_dd_usd >= 0) output.max_dd_usd = data.max_dd_usd;
  for (const key of ["label", "first", "last", "since", "run_id", "source"]) if (text(data[key])) output[key] = data[key];
  if (data.costs && typeof data.costs === "object") {
    const costs = {};
    for (const key of ["commission_rt_usd", "entry_slip_ticks", "stop_slip_ticks"]) if (finite(data.costs[key]) && data.costs[key] >= 0) costs[key] = data.costs[key];
    if (text(data.costs.contract, 20)) costs.contract = data.costs.contract;
    if (Object.keys(costs).length) output.costs = costs;
  }
  if (Array.isArray(data.months) && data.months.length <= 1200) {
    const valid = data.months.every((row, i) => row && typeof row.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) && count(row.trades) && finite(row.net_usd) && (!row.sample || row.sample === "paper") && (!i || data.months[i - 1].month < row.month));
    if (valid) output.months = data.months.map((row) => ({ month: row.month, trades: row.trades, net_usd: row.net_usd, ...(finite(row.net_r) ? { net_r: row.net_r } : {}) }));
  }
  output.equity_status = "not_exported";
  if (Array.isArray(data.equity) && data.equity.length) {
    let balance = 0, peak = 0;
    const valid = data.equity.length <= 10000 && data.equity.every((row, i) => {
      if (!row || !date(row.date) || !finite(row.equity_usd) || row.sample && row.sample !== "paper" || i && data.equity[i - 1].date >= row.date) return false;
      if (Object.hasOwn(row, "net_usd") && (!finite(row.net_usd) || !near(balance + row.net_usd, row.equity_usd))) return false;
      balance = row.equity_usd; peak = Math.max(peak, balance);
      if (Object.hasOwn(row, "drawdown_usd") && (!finite(row.drawdown_usd) || !near(peak - balance, row.drawdown_usd))) return false;
      if (Object.hasOwn(row, "n") && !count(row.n)) return false;
      return !Object.hasOwn(row, "net_r") || finite(row.net_r);
    }) && (!finite(output.net_usd) || near(balance, output.net_usd));
    if (valid) {
      output.equity_status = "available";
      output.equity = data.equity.map((row) => {
        const point = { date: row.date, equity_usd: row.equity_usd, sample: "paper" };
        for (const key of ["n", "net_r", "net_usd", "drawdown_usd"]) if (Object.hasOwn(row, key)) point[key] = row[key];
        return point;
      });
    } else output.equity_status = "rejected";
  }
  return output;
}
