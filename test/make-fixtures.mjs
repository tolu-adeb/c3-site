// Synthetic chart data only. Never reads c3.lab, its keys, or market/holdout data.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_SEED = 20261026;
export const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/bundle/", import.meta.url));
const commit = "0".repeat(40); // Sentinel, not a real c3.lab revision.
const round = (n) => Math.round(n * 1e6) / 1e6;
const sum = (rows, key) => round(rows.reduce((s, row) => s + row[key], 0));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Mulberry32 uses explicit 32-bit integer operations, independent of OS and clock.
function random(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function buildFixtureBundle(seed = DEFAULT_SEED) {
  const rnd = random(seed);
  const files = new Map();
  const put = (path, data) => files.set(path, Buffer.from(JSON.stringify(data, null, 2) + "\n"));
  const strategies = [];
  const runs = ["orx-synthetic-v1", "orb-synthetic-v1"];
  const dates = ["2026-07-30", "2026-07-31", "2026-08-03", "2026-08-04", "2026-08-05",
    "2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11", "2026-08-12"];
  const grossR = [-1, -1, 0.5, -1, -0.25, 0.5, 1.5, 0.5, -1, 1.5, 0.75, 0.5, -1, 1.5, 0.75];
  const sessions = [];
  for (const [runNumber, run] of runs.entries()) {
    const strategy = runNumber ? "orb" : "orx";
    const runDates = dates.slice(runNumber * 5, runNumber * 5 + 5);
    const trades = [], equity = [], index = [];
    let balance = 0, peak = 0;
    for (const [dayNumber, date] of runDates.entries()) {
      const start = Date.parse(`${date}T09:00:00-04:00`) / 1000;
      let price = 20000 + runNumber * 100 + dayNumber * 20;
      const bars = Array.from({ length: 78 }, (_, barNumber) => {
        const open = price;
        price = Math.round((price + (rnd() - 0.5) * 8) * 4) / 4;
        return [start + barNumber * 300, open, Math.max(open, price) + 1,
          Math.min(open, price) - 1, price, 100 + Math.floor(rnd() * 900)];
      });
      const sample = dayNumber < 3 ? "in" : "out";
      const dayTrades = [];
      for (let j = 0; j < 3; j++) {
        const id = dayNumber * 3 + j + 1;
        const side = (id + runNumber) % 2 ? "long" : "short";
        const direction = side === "long" ? 1 : -1;
        const entryIndex = 6 + j * 12, exitIndex = entryIndex + 5;
        const entry = bars[entryIndex][1], risk = 8;
        const pts = risk * grossR[(id - 1 + runNumber * 4) % grossR.length];
        const exit = entry + direction * pts;
        // Align executed entry/exit prices with visible bars for replay tests.
        for (let b = entryIndex; b <= exitIndex; b++) {
          const open = b === entryIndex ? entry : bars[b - 1][4];
          const close = Math.round((entry + (exit - entry) * (b - entryIndex + 1) / 6) * 4) / 4;
          bars[b] = [bars[b][0], open, Math.max(open, close) + 0.5, Math.min(open, close) - 0.5, close, bars[b][5]];
        }
        const usd = round(pts * 2 - 1.24);
        const path = bars.slice(entryIndex, exitIndex + 1);
        const trade = { id, date, setup: strategy, side, grade: id % 3 ? "A" : "B",
          regime: dayNumber % 2 ? "range" : "trend",
          opened: new Date(bars[entryIndex][0] * 1000).toISOString(),
          closed: new Date(bars[exitIndex][0] * 1000).toISOString(),
          entry, stop: entry - direction * risk, t1: entry + direction * risk * 0.5,
          final: entry + direction * risk * 2, risk_pts: risk, exit,
          exit_reason: pts <= -risk ? "stop" : pts < 0 ? "time" : "target",
          t1_hit: pts >= risk * 0.5, r: round(usd / (risk * 2)), pts, usd,
          mfe_pts: round(Math.max(0, ...path.map((bar) => direction * ((direction > 0 ? bar[2] : bar[3]) - entry)))),
          mae_pts: round(Math.max(0, ...path.map((bar) => -direction * ((direction > 0 ? bar[3] : bar[2]) - entry)))),
          score: 60 + id % 4 * 10, reasons: ["Synthetic signal for fixture testing; no trading rule was evaluated."], sample };
        trades.push(trade);
        dayTrades.push(trade);
      }
      const session = { date, tz: "America/New_York", tf: "5m", source: "synthetic", bars,
        levels: [{ name: "ORH", price: Math.max(...bars.slice(6, 9).map((b) => b[2])), from: start + 8 * 300 },
          { name: "ORL", price: Math.min(...bars.slice(6, 9).map((b) => b[3])), from: start + 8 * 300 }],
        windows: [{ name: "Opening range", from: start + 6 * 300, to: start + 9 * 300 },
          { name: "Entry window", from: start + 9 * 300, to: start + 18 * 300 }],
        context: { bias: "Synthetic", trend_50d: dayNumber % 2 ? "down" : "up", fomc: dayNumber === 2, mode: "fixture" },
        trades: dayTrades,
        decisions: [{ t: start + 3 * 300, kind: "gate", text: "Synthetic rejected candidate; test data only.", score: 35, threshold: 60, gates: Array.from({ length: 12 }, (_, g) => ({ name: `Gate ${g + 1}`, pass: g !== 2 })) }, ...dayTrades.flatMap((trade) => [
          { t: Date.parse(trade.opened) / 1000, kind: "signal", text: "Synthetic signal; test data only.", score: trade.score, threshold: 60,
            gates: Array.from({ length: 12 }, (_, g) => ({ name: `Gate ${g + 1}`, pass: true })) },
          { t: Date.parse(trade.closed) / 1000, kind: "exit", text: `Synthetic ${trade.exit_reason} exit.` }
        ])].sort((a, b) => a.t - b.t), done: "Synthetic session complete" };
      sessions.push(session);
      put(`runs/${run}/sessions/${date}.json`, session);
      const net_usd = sum(dayTrades, "usd"), net_r = sum(dayTrades, "r");
      balance = round(balance + net_usd);
      peak = Math.max(peak, balance);
      equity.push({ date, n: dayTrades.length, net_r, net_usd, equity_usd: balance, drawdown_usd: round(peak - balance), sample });
      index.push({ date, n_trades: dayTrades.length, net_r, has_bars: true, tags: ["synthetic", sample === "in" ? "in-sample" : "out-of-sample"] });
    }
    const groups = (key) => Object.groupBy(trades, key);
    const monthly = Object.entries(groups((t) => t.date.slice(0, 7))).map(([month, rows]) => ({
      month, trades: rows.length, win_rate: rows.filter((t) => t.r > 0).length / rows.length,
      net_r: sum(rows, "r"), net_usd: sum(rows, "usd") }));
    const segments = Object.fromEntries(Object.entries({ by_side: "side", by_regime: "regime", by_time: (t) => t.opened.slice(11, 16),
      by_grade: "grade", by_exit: "exit_reason", by_setup: "setup" }).map(([name, key]) => [name,
      Object.fromEntries(Object.entries(groups(typeof key === "function" ? key : (t) => t[key])).map(([group, rows]) => [group, {
        n: rows.length, win_rate: rows.filter((t) => t.r > 0).length / rows.length, avg_r: round(sum(rows, "r") / rows.length),
        net_r: sum(rows, "r"), net_usd: sum(rows, "usd") }]))]));
    const dailyMean = sum(equity, "net_usd") / equity.length;
    const dailyStd = Math.sqrt(equity.reduce((s, d) => s + (d.net_usd - dailyMean) ** 2, 0) / (equity.length - 1));
    const losses = -trades.filter((t) => t.usd < 0).reduce((s, t) => s + t.usd, 0);
    put(`runs/${run}/summary.json`, { run_id: run, strategy, label: "Synthetic fixture — hypothetical test data only",
      dataset: { kind: "synthetic", source: `Seeded synthetic bars (seed ${seed}); no market data`, start: runDates[0], end: runDates.at(-1), sessions: 5 },
      kind: runNumber ? "walk_forward" : "backtest",
      costs: { commission_rt_usd: 1.24, entry_slip_ticks: 1, stop_slip_ticks: 1, contract: "MNQ" },
      split: { in_sample: [runDates[0], runDates[2]], out_of_sample: [runDates[3], runDates[4]] },
      stats: { trades: trades.length, win_rate: trades.filter((t) => t.r > 0).length / trades.length,
        avg_r: round(sum(trades, "r") / trades.length), net_r: sum(trades, "r"), net_usd: sum(trades, "usd"),
        max_dd_usd: Math.max(...equity.map((d) => d.drawdown_usd)),
        profit_factor: losses ? round(trades.filter((t) => t.usd > 0).reduce((s, t) => s + t.usd, 0) / losses) : null,
        sharpe_daily: dailyStd ? round(dailyMean / dailyStd * Math.sqrt(252)) : null,
        months_positive: monthly.filter((m) => m.net_usd > 0).length, months: monthly.length,
        worst_month_usd: Math.min(...monthly.map((m) => m.net_usd)) },
      segments, checks: {}, c3lab_commit: commit, params_hash: `sha256:${hash(Buffer.from("synthetic fixture parameters"))}` });
    put(`runs/${run}/trades.json`, trades);
    put(`runs/${run}/equity.json`, equity);
    put(`runs/${run}/monthly.json`, monthly);
    put(`runs/${run}/sessions/index.json`, index);
    strategies.push({ id: strategy, name: `${strategy.toUpperCase()} — synthetic fixture`, state: "paper",
      one_line: "Synthetic description for testing; not a published strategy result.", mechanism: "No mechanism is evaluated in fixtures.",
      rules: ["Render exported rows only."], exits: ["Draw the exported exit."], filters: ["Synthetic sessions only."],
      scoring: "Fixture scores exercise the 0–100 display.", params_public: {}, runs: [run], lab_trials: [runNumber + 1] });
  }
  put("strategies.json", strategies);
  const nodes = ["feed", "structure", "context", "intraday", "models", "score", "gates", "tracker", "alerts", "ledger", "lab", "site"];
  put("engine.json", { nodes: nodes.map((id, i) => ({ id, name: id[0].toUpperCase() + id.slice(1),
    text: `Synthetic ${id} node for schematic tests.`, spec_section: `§${i + 3}`, href: `/methodology/#${id}`,
    inputs: [i ? nodes[i - 1] : "bars"], outputs: [nodes[i + 1] || "public data"], state: "fixture only" })),
    edges: nodes.slice(1).map((id, i) => ({ from: nodes[i], to: id })) });
  const verdicts = [...Array(6).fill("rejected"), ...Array(3).fill("failed_holdout"), ...Array(2).fill("candidate"), "approved"];
  const trials = verdicts.map((verdict, i) => ({ id: i + 1, ts: new Date(Date.UTC(2026, 7, 20 - i, 12)).toISOString(),
    source: ["research agent", "KH", "CLI"][i % 3], name: `Synthetic hypothesis ${i + 1}`, changes: {}, verdict,
    failed_check: verdict === "rejected" ? "win_rate_delta" : verdict === "failed_holdout" ? "holdout_net_dd" : null,
    summary: { trades: 30, win_rate: round(0.4 + rnd() * 0.3), net_usd: round((rnd() - 0.5) * 300), max_dd_usd: 100, avg_r: round((rnd() - 0.5) / 2) },
    baseline: { trades: 30, win_rate: 0.5, net_usd: 50, max_dd_usd: 100, avg_r: 0.1 }, holdout_looks: verdict === "rejected" ? 0 : 1 }));
  put("lab/trials.json", trials);
  put("lab/summary.json", { tried: 12, passed_search: 6, passed_holdout: 3, approved: 1,
    by_verdict: { rejected: 6, failed_holdout: 3, candidate: 2, approved: 1 },
    holdout_windows: [{ id: "synthetic-holdout", start: "2026-08-04", end: "2026-08-12", looks_used: 6, looks_limit: 6 }] });
  const parity = sessions.slice(0, 3).map((session, i) => {
    const live_trades = structuredClone(session.trades);
    if (i === 1) {
      const trade = live_trades[0];
      trade.exit = round(trade.exit + (trade.side === "long" ? -1 : 1));
      trade.pts = round(trade.pts - 1);
      trade.usd = round(trade.pts * 2 - 1.24);
      trade.r = round(trade.usd / (trade.risk_pts * 2));
    }
    const row = { day: session.date, verdict: i === 1 ? "differs" : "match", live_r: sum(live_trades, "r"),
      backtest_r: sum(session.trades, "r"), causes: i === 1 ? ["Synthetic uptime gap delayed a paper fill."] : [] };
    put(`parity/${row.day}.json`, { ...row, notes: ["Synthetic parity, not a forward track record."], live_trades,
      backtest_trades: session.trades, uptime_gaps: i === 1 ? [{ from: session.trades[0].opened, to: session.trades[0].closed, note: "Synthetic gap" }] : [] });
    return row;
  });
  put("parity/index.json", parity);
  const inventory = [...files].sort(([a], [b]) => a.localeCompare(b, "en")).map(([path, bytes]) => ({ path, sha256: hash(bytes), bytes: bytes.length }));
  put("manifest.json", { schema_version: 1, bundle: `synthetic-${seed}-v1`, generated_at: "2026-08-21T00:00:00Z",
    c3lab_commit: commit, synthetic: true, files: inventory, runs, featured: { run: runs[0], day: dates[0] } });
  return files;
}

export async function writeFixtureBundle(out = FIXTURE_DIR, seed = DEFAULT_SEED) {
  const files = buildFixtureBundle(seed);
  for (const [path, bytes] of files) {
    const target = resolve(out, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 2) throw new Error("Usage: node test/make-fixtures.mjs [output-directory] [uint32-seed]");
  const seed = args[1] === undefined ? DEFAULT_SEED : Number(args[1]);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed must be a uint32 integer.");
  const files = await writeFixtureBundle(args[0] || FIXTURE_DIR, seed);
  console.log(`Generated ${files.size} synthetic bundle files (seed ${seed}).`);
}
