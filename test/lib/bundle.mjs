import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const schemaDir = fileURLToPath(new URL("../../schemas/", import.meta.url));
const schemaBase = "https://c3.site/schemas/v1/";
const safePath = /^(?!.*\.\.)(?!.*\/\/)[a-z0-9][a-z0-9/_.-]{0,200}\.json$/;
const near = (a, b) => Math.abs(a - b) <= 1e-6;
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const check = (condition, message) => { if (!condition) throw new Error(message); };

const routes = [
  [/^manifest\.json$/, "manifest"], [/^strategies\.json$/, "strategies"], [/^engine\.json$/, "engine"],
  [/^runs\/([a-z0-9-]+)\/summary\.json$/, "summary"],
  [/^runs\/([a-z0-9-]+)\/trades\.json$/, "trades"],
  [/^runs\/([a-z0-9-]+)\/equity\.json$/, "equity"],
  [/^runs\/([a-z0-9-]+)\/monthly\.json$/, "monthly"],
  [/^runs\/([a-z0-9-]+)\/sessions\/index\.json$/, "sessions-index"],
  [/^runs\/([a-z0-9-]+)\/sessions\/(\d{4}-\d{2}-\d{2})\.json$/, "session"],
  [/^lab\/trials\.json$/, "trials"], [/^lab\/summary\.json$/, "lab-summary"],
  [/^parity\/index\.json$/, "parity-index"], [/^parity\/\d{4}-\d{2}-\d{2}\.json$/, "parity"]
];

export async function loadSchemas() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const names = (await readdir(schemaDir)).filter((name) => name.endsWith(".schema.json")).sort();
  for (const name of names) ajv.addSchema(JSON.parse(await readFile(join(schemaDir, name), "utf8")));
  // Compile every schema, including optional files which may not appear in a bundle.
  return new Map(names.map((name) => [name.replace(".schema.json", ""), ajv.getSchema(schemaBase + name)]));
}

export async function readBundle(directory) {
  const root = resolve(directory), files = new Map();
  async function walk(path) {
    for (const name of (await readdir(path)).sort()) {
      const target = join(path, name), stat = await lstat(target);
      check(!stat.isSymbolicLink(), `Symlink is not a bundle file: ${target}`);
      if (stat.isDirectory()) await walk(target);
      else {
        check(stat.isFile(), `Not a regular bundle file: ${target}`);
        check(stat.size <= 1500000, `Bundle file exceeds 1.5 MB: ${target}`);
        files.set(relative(root, target).split("\\").join("/"), await readFile(target));
      }
    }
  }
  await walk(root);
  return files;
}

export async function validateBundle(files, schemas) {
  schemas ??= await loadSchemas();
  const data = new Map();
  for (const path of files.keys()) check(safePath.test(path), `Unsafe bundle path: ${path}`);
  for (const [path, bytes] of files) {
    const route = routes.find(([pattern]) => pattern.test(path));
    check(route, `No schema for bundle file: ${path}`);
    check(bytes.length <= 1500000, `${path}: exceeds 1.5 MB`);
    if (route[1] === "session") check(bytes.length <= 60000, `${path}: session exceeds 60 KB`);
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`${path}: invalid JSON`); }
    const validate = schemas.get(route[1]);
    check(validate(value), `${path}: ${JSON.stringify(validate.errors)}`);
    data.set(path, value);
  }
  const get = (path) => { check(data.has(path), `Missing bundle file: ${path}`); return data.get(path); };
  const unique = (rows, key, label) => check(new Set(rows.map((r) => r[key])).size === rows.length, `${label}: duplicate ${key}`);
  const ascending = (rows, key, label) => check(rows.every((r, i) => !i || rows[i - 1][key] < r[key]), `${label}: ${key} must be strictly increasing`);
  const equal = (a, b, label) => check(near(a, b), `${label}: ${a} != ${b}`);
  const manifest = get("manifest.json");
  unique(manifest.files, "path", "manifest.files");
  const listed = new Set(manifest.files.map((f) => f.path));
  check(!listed.has("manifest.json"), "manifest.json must not list itself");
  check(files.size === listed.size + 1 && [...files.keys()].every((p) => p === "manifest.json" || listed.has(p)), "Manifest inventory does not match bundle files");
  for (const entry of manifest.files) {
    check(files.has(entry.path), `Manifest file missing: ${entry.path}`);
    const bytes = files.get(entry.path);
    check(bytes.length === entry.bytes, `${entry.path}: byte length differs from manifest`);
    check(createHash("sha256").update(bytes).digest("hex") === entry.sha256, `${entry.path}: SHA-256 differs from manifest`);
  }
  for (const path of files.keys()) {
    if (path.startsWith("runs/")) check(manifest.runs.includes(path.split("/")[1]), `${path}: run absent from manifest`);
  }
  const strategies = get("strategies.json"), trials = get("lab/trials.json");
  unique(strategies, "id", "strategies");
  unique(trials, "id", "lab trials");
  check(trials.every((t, i) => !i || trials[i - 1].ts >= t.ts), "Trials must be newest first");
  for (const strategy of strategies) {
    for (const run of strategy.runs) check(manifest.runs.includes(run), `${strategy.id}: unknown run ${run}`);
    for (const id of strategy.lab_trials) check(trials.some((t) => t.id === id), `${strategy.id}: unknown lab trial ${id}`);
  }
  for (const run of manifest.runs) {
    const prefix = `runs/${run}/`;
    const summary = get(prefix + "summary.json"), trades = get(prefix + "trades.json");
    const equity = get(prefix + "equity.json"), monthly = get(prefix + "monthly.json"), index = get(prefix + "sessions/index.json");
    const label = (s) => `${run}: ${s}`;
    check(summary.run_id === run, label("summary run_id differs from path"));
    check(summary.c3lab_commit === manifest.c3lab_commit, label("commit differs from manifest"));
    const strategy = strategies.find((s) => s.id === summary.strategy);
    check(strategy && strategy.runs.includes(run), label("strategy/run link is missing"));
    check(summary.dataset.start <= summary.dataset.end, label("dataset range is reversed"));
    const [inStart, inEnd] = summary.split.in_sample, [outStart, outEnd] = summary.split.out_of_sample;
    check(inStart <= inEnd && inEnd < outStart && outStart <= outEnd, label("sample ranges overlap or are reversed"));
    const sampleFor = (date) => date >= inStart && date <= inEnd ? "in" : date >= outStart && date <= outEnd ? "out" : null;
    unique(trades, "id", label("trades"));
    ascending(index, "date", label("sessions"));
    ascending(equity, "date", label("equity"));
    ascending(monthly, "month", label("monthly"));
    equal(summary.dataset.sessions, index.length, label("session count"));
    equal(equity.length, index.length, label("equity session count"));
    equal(summary.stats.trades, trades.length, label("trade count"));
    for (const key of ["r", "usd"]) equal(summary.stats[`net_${key}`], sum(trades, key), label(`net ${key}`));
    equal(summary.stats.win_rate, trades.length ? trades.filter((t) => t.r > 0).length / trades.length : 0, label("win rate"));
    equal(summary.stats.avg_r, trades.length ? sum(trades, "r") / trades.length : 0, label("average R"));
    const indexedDates = new Set(index.map((d) => d.date));
    for (const trade of trades) {
      check(indexedDates.has(trade.date), label(`trade ${trade.id}: session missing`));
      check(trade.sample === sampleFor(trade.date), label(`trade ${trade.id}: incorrect sample`));
      check(Date.parse(trade.opened) <= Date.parse(trade.closed), label(`trade ${trade.id}: closed before entry`));
    }
    let balance = 0, peak = 0;
    for (const [i, day] of index.entries()) {
      check(day.date >= summary.dataset.start && day.date <= summary.dataset.end, label("session outside dataset"));
      const rows = trades.filter((t) => t.date === day.date), point = equity[i];
      check(point.date === day.date && point.sample === sampleFor(day.date), label(`${day.date}: equity date/sample mismatch`));
      equal(day.n_trades, rows.length, label(`${day.date}: session trades`));
      equal(day.net_r, sum(rows, "r"), label(`${day.date}: session R`));
      equal(point.n, rows.length, label(`${day.date}: equity trades`));
      equal(point.net_r, sum(rows, "r"), label(`${day.date}: equity R`));
      equal(point.net_usd, sum(rows, "usd"), label(`${day.date}: equity USD`));
      balance += point.net_usd;
      peak = Math.max(peak, balance);
      equal(point.equity_usd, balance, label(`${day.date}: cumulative equity`));
      equal(point.drawdown_usd, peak - balance, label(`${day.date}: drawdown`));
      const path = prefix + `sessions/${day.date}.json`;
      check(day.has_bars === data.has(path), label(`${day.date}: has_bars does not match file`));
      if (!day.has_bars) continue;
      const session = get(path);
      check(session.date === day.date && session.source === summary.dataset.kind, `${path}: date/source mismatch`);
      check(JSON.stringify(session.trades) === JSON.stringify(rows), `${path}: session trades differ from run trades`);
      const bars = session.bars;
      for (const [b, [t, o, h, l, c]] of bars.entries()) {
        check(!b || t > bars[b - 1][0], `${path}: bars must increase in time`);
        check(h >= Math.max(o, c) && l <= Math.min(o, c), `${path}: invalid OHLC range`);
      }
      for (const trade of rows) {
        for (const timestamp of [trade.opened, trade.closed]) {
          check(bars.some((b) => b[0] === Date.parse(timestamp) / 1000), `${path}: trade time has no bar`);
        }
      }
      check(session.decisions.every((d, n) => d.t >= bars[0][0] && d.t <= bars.at(-1)[0] && (!n || d.t >= session.decisions[n - 1].t)), `${path}: decisions out of time order/range`);
      check(session.windows.every((w) => w.from <= w.to), `${path}: reversed window`);
    }
    for (const path of files.keys()) {
      if (path.startsWith(prefix + "sessions/") && !path.endsWith("index.json")) {
        check(indexedDates.has(path.slice(-15, -5)), `${path}: session absent from index`);
      }
    }
    equal(summary.stats.max_dd_usd, Math.max(0, ...equity.map((p) => p.drawdown_usd)), label("maximum drawdown"));
    const months = [...new Set(index.map((d) => d.date.slice(0, 7)))];
    check(JSON.stringify(monthly.map((m) => m.month)) === JSON.stringify(months), label("monthly dates differ from sessions"));
    for (const month of monthly) {
      const rows = trades.filter((t) => t.date.startsWith(month.month));
      equal(month.trades, rows.length, label(`${month.month}: trades`));
      equal(month.win_rate, rows.length ? rows.filter((t) => t.r > 0).length / rows.length : 0, label(`${month.month}: win rate`));
      equal(month.net_r, sum(rows, "r"), label(`${month.month}: R`));
      equal(month.net_usd, sum(rows, "usd"), label(`${month.month}: USD`));
    }
    equal(summary.stats.months, monthly.length, label("month count"));
    equal(summary.stats.months_positive, monthly.filter((m) => m.net_usd > 0).length, label("positive months"));
    equal(summary.stats.worst_month_usd, monthly.length ? Math.min(...monthly.map((m) => m.net_usd)) : 0, label("worst month"));
  }
  check(manifest.runs.includes(manifest.featured.run), "Featured run is absent from manifest");
  get(`runs/${manifest.featured.run}/sessions/${manifest.featured.day}.json`);
  const lab = get("lab/summary.json");
  for (const [verdict, count] of Object.entries(lab.by_verdict)) equal(count, trials.filter((t) => t.verdict === verdict).length, `Lab ${verdict}`);
  equal(lab.tried, trials.length, "Lab tried");
  equal(lab.passed_search, trials.filter((t) => t.verdict !== "rejected").length, "Lab passed search");
  equal(lab.passed_holdout, lab.by_verdict.candidate + lab.by_verdict.approved, "Lab passed holdout");
  equal(lab.approved, lab.by_verdict.approved, "Lab approved");
  check(lab.holdout_windows.every((w) => w.start <= w.end && w.looks_used <= w.looks_limit), "Lab holdout window or look budget invalid");
  const parity = get("parity/index.json");
  ascending(parity, "day", "parity index");
  for (const row of parity) {
    const detail = get(`parity/${row.day}.json`);
    for (const key of Object.keys(row)) check(JSON.stringify(detail[key]) === JSON.stringify(row[key]), `Parity ${row.day}: ${key} differs from index`);
    equal(row.live_r, sum(detail.live_trades, "r"), `Parity ${row.day}: live R`);
    equal(row.backtest_r, sum(detail.backtest_trades, "r"), `Parity ${row.day}: backtest R`);
    check(row.verdict !== "match" || near(row.live_r, row.backtest_r), `Parity ${row.day}: match with different R`);
    check(row.verdict !== "differs" || row.causes.length > 0, `Parity ${row.day}: mismatch needs a cause`);
  }
  for (const path of files.keys()) {
    if (/^parity\/\d/.test(path)) check(parity.some((p) => path === `parity/${p.day}.json`), `${path}: absent from parity index`);
  }
  if (data.has("engine.json")) {
    const engine = get("engine.json");
    unique(engine.nodes, "id", "engine nodes");
    check(engine.edges.every((e) => engine.nodes.some((n) => n.id === e.from) && engine.nodes.some((n) => n.id === e.to)), "Engine edge references unknown node");
  }
  return { files: files.size, runs: manifest.runs.length, sessions: manifest.runs.reduce((n, run) => n + get(`runs/${run}/sessions/index.json`).length, 0),
    trades: manifest.runs.reduce((n, run) => n + get(`runs/${run}/trades.json`).length, 0), trials: trials.length, parity: parity.length };
}
