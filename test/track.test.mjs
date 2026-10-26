import test from "node:test";
import assert from "node:assert/strict";
import { paperProjection } from "../src/track.js";
test("paper projection preserves legacy totals while excluding private nested keys", () => {
  const projected = paperProjection({ trades: 12, win_rate: .75, net_pts: 120.5, secret_field: "private", months: [{ month: "2026-10", trades: 12, net_usd: 230.1, secret: "private" }], costs: { commission_rt_usd: 1.24, private_key: "private" } });
  assert.equal(projected.trades, 12); assert.equal(projected.sample, "paper");
  assert.equal(projected.equity_status, "not_exported");
  assert.equal(JSON.stringify(projected).includes("private"), false);
});
test("paper projection rejects other samples and incoherent equity", () => {
  for (const kind of ["backtest", "walk_forward", "live"]) assert.equal(paperProjection({ kind, trades: 12 }), null);
  assert.equal(paperProjection({ sample: "out", trades: 12 }), null);
  const data = { kind: "paper", trades: 2, net_usd: 5, equity: [{ date: "2026-10-01", net_usd: 10, equity_usd: 10, drawdown_usd: 0, private: "hidden" }, { date: "2026-10-02", net_usd: -5, equity_usd: 5, drawdown_usd: 5 }] };
  const good = paperProjection(data);
  assert.equal(good.equity_status, "available"); assert.equal(good.equity.length, 2);
  assert.equal(JSON.stringify(good).includes("private"), false);
  const invalid = structuredClone(data); invalid.equity[1].sample = "out";
  assert.equal(paperProjection(invalid).equity_status, "rejected");
  invalid.equity[1].sample = "paper"; invalid.equity[1].equity_usd = 500;
  assert.equal(paperProjection(invalid).equity_status, "rejected");
});
