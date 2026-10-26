import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { aggregate, monthly, segments } from "../public/assets/results.js";
const prefix = new URL("./fixtures/bundle/runs/orx-synthetic-v1/", import.meta.url);
const trades = JSON.parse(await readFile(new URL("trades.json", prefix)));
const daily = JSON.parse(await readFile(new URL("equity.json", prefix)));
test("aggregating exported rows reproduces equity and selected-side totals", () => {
  const result = aggregate(trades, daily);
  assert.ok(Math.abs(result.stats.net_usd - 25.4) < 1e-6);
  assert.ok(Math.abs(result.stats.max_dd_usd - 43.44) < 1e-6);
  const short = trades.filter((t) => t.side === "short"), selected = aggregate(short, daily);
  assert.equal(selected.stats.trades, 7);
  assert.ok(Math.abs(selected.stats.net_usd - short.reduce((s, t) => s + t.usd, 0)) < 1e-6);
  assert.equal(segments(short, "side")[0].n, 7);
  assert.equal(monthly(trades, daily).length, 2);
  assert.equal(aggregate([], []).stats.trades, 0);
});
