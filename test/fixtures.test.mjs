import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFixtureBundle, writeFixtureBundle, FIXTURE_DIR } from "./make-fixtures.mjs";
import { loadSchemas, readBundle, validateBundle } from "./lib/bundle.mjs";

const schemas = await loadSchemas();
const fresh = () => buildFixtureBundle();
const json = (files, path) => JSON.parse(files.get(path));
const set = (files, path, data) => files.set(path, Buffer.from(JSON.stringify(data, null, 2) + "\n"));
function inventory(files) {
  const manifest = json(files, "manifest.json");
  manifest.files = [...files].filter(([path]) => path !== "manifest.json").map(([path, bytes]) => ({
    path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length
  }));
  set(files, "manifest.json", manifest);
}
async function rejects(change, error, rehash = true) {
  const files = fresh();
  change(files);
  if (rehash) inventory(files);
  await assert.rejects(validateBundle(files, schemas), error);
}

test("committed fixtures are exactly reproducible, including manifest hashes and inventory", async () => {
  const committed = await readBundle(FIXTURE_DIR), first = fresh(), second = fresh();
  assert.deepEqual(committed, first);
  assert.deepEqual(first, second);
  const other = buildFixtureBundle(123);
  assert.notDeepEqual(other, first);
  await validateBundle(other, schemas);
});

test("bundle has the specified coverage and reconciles all published aggregates", async () => {
  const files = fresh();
  assert.deepEqual(await validateBundle(files, schemas), { files: 29, runs: 2, sessions: 10, trades: 30, trials: 12, parity: 3 });
  for (const run of json(files, "manifest.json").runs) {
    const prefix = `runs/${run}/`, trades = json(files, prefix + "trades.json");
    assert.ok(trades.some((t) => t.side === "long") && trades.some((t) => t.side === "short"));
    assert.ok(trades.some((t) => t.r < 0) && trades.some((t) => t.r > 0));
    assert.ok(trades.some((t) => t.sample === "in") && trades.some((t) => t.sample === "out"));
    for (const day of json(files, prefix + "sessions/index.json")) {
      assert.equal(json(files, prefix + `sessions/${day.date}.json`).bars.length, 78);
    }
  }
  assert.ok(json(files, "parity/index.json").some((p) => p.verdict === "differs"));
  assert.ok(json(files, "runs/orx-synthetic-v1/monthly.json").some((p) => p.net_usd < 0));
});

test("writing twice to a separate directory is byte-identical", async () => {
  const dir = await mkdtemp(join(tmpdir(), "c3-fixture-test-"));
  try {
    await writeFixtureBundle(dir);
    const first = await readBundle(dir);
    await writeFixtureBundle(dir);
    assert.deepEqual(await readBundle(dir), first);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("engine description is optional", async () => {
  const files = fresh(); files.delete("engine.json"); inventory(files);
  await validateBundle(files, schemas);
});

test("schemas reject missing fields, wrong types, enums, dates and private keys", () => {
  const files = fresh();
  for (const [name, value] of [
    ["manifest", { ...json(files, "manifest.json"), schema_version: 2 }],
    ["strategies", [{ ...json(files, "strategies.json")[0], state: "secret" }]],
    ["trades", [{ ...json(files, "runs/orx-synthetic-v1/trades.json")[0], date: "2026-02-30" }]],
    ["equity", [{ ...json(files, "runs/orx-synthetic-v1/equity.json")[0], net_r: "1" }]],
    ["trials", [{ ...json(files, "lab/trials.json")[0], rationale: "private text" }]],
    ["strategies", [{ ...json(files, "strategies.json")[0], params_public: { entry_threshold: 42 } }]],
    ["summary", { ...json(files, "runs/orx-synthetic-v1/summary.json"), costs: undefined }]
  ]) assert.equal(schemas.get(name)(value), false, name);
});

test("every file schema rejects unknown top-level fields", () => {
  const files = fresh();
  const examples = { manifest: "manifest.json", strategies: "strategies.json", engine: "engine.json",
    summary: "runs/orx-synthetic-v1/summary.json", trades: "runs/orx-synthetic-v1/trades.json",
    equity: "runs/orx-synthetic-v1/equity.json", monthly: "runs/orx-synthetic-v1/monthly.json",
    "sessions-index": "runs/orx-synthetic-v1/sessions/index.json", session: "runs/orx-synthetic-v1/sessions/2026-07-30.json",
    trials: "lab/trials.json", "lab-summary": "lab/summary.json", "parity-index": "parity/index.json", parity: "parity/2026-07-30.json" };
  for (const [name, path] of Object.entries(examples)) {
    const data = json(files, path);
    (Array.isArray(data) ? data[0] : data).secret_key = "not-public";
    assert.equal(schemas.get(name)(data), false, name);
  }
});

test("rejects corrupted hashes and byte lengths", async () => {
  await rejects((f) => { const p = "engine.json"; f.set(p, Buffer.concat([f.get(p), Buffer.from(" ")])); }, /byte length/, false);
  await rejects((f) => { const p = "engine.json"; f.set(p, Buffer.from(f.get(p).toString().replace("bars", "BARS"))); }, /SHA-256/, false);
});
test("rejects missing files and unlisted files", async () => {
  await rejects((f) => f.delete("strategies.json"), /inventory|missing/i, false);
  await rejects((f) => set(f, "extra.json", {}), /No schema/);
});
test("rejects duplicate inventory paths and manifest self-reference", async () => {
  await rejects((f) => { const m = json(f, "manifest.json"); m.files.push(m.files[0]); set(f, "manifest.json", m); }, /duplicate path/, false);
  await rejects((f) => { const m = json(f, "manifest.json"); m.files.push({ path: "manifest.json", sha256: "0".repeat(64), bytes: 1 }); set(f, "manifest.json", m); }, /must not list itself/, false);
});
test("rejects traversal, absolute paths, empty path segments, and symlinks", async () => {
  for (const path of ["../outside.json", "/tmp/outside.json", "runs//summary.json", "runs/a/../../x.json"]) {
    await rejects((f) => set(f, path, {}), /Unsafe bundle path/);
  }
  const dir = await mkdtemp(join(tmpdir(), "c3-symlink-test-"));
  try {
    await symlink(FIXTURE_DIR, join(dir, "linked"));
    await assert.rejects(readBundle(dir), /Symlink/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("rejects malformed JSON and oversized session files", async () => {
  await rejects((f) => f.set("engine.json", Buffer.from("{")), /invalid JSON/);
  await rejects((f) => { const p = "runs/orx-synthetic-v1/sessions/2026-07-30.json"; f.set(p, Buffer.concat([f.get(p), Buffer.alloc(60000, 32)])); }, /exceeds 60 KB/);
});
test("rejects invalid OHLC tuples, geometry and dates", async () => {
  const path = "runs/orx-synthetic-v1/sessions/2026-07-30.json";
  for (const mutate of [(s) => s.bars[0].pop(), (s) => s.bars[0][2] = -1, (s) => s.date = "2026-07-29"]) {
    await rejects((f) => { const s = json(f, path); mutate(s); set(f, path, s); }, /minItems|OHLC|date\/source/);
  }
});
test("rejects broken references, sample splits, and aggregates", async () => {
  await rejects((f) => { const m = json(f, "manifest.json"); m.featured.run = "unknown"; set(f, "manifest.json", m); }, /Featured run/);
  const p = "runs/orx-synthetic-v1/summary.json";
  for (const mutate of [(s) => s.stats.net_r++, (s) => s.split.out_of_sample[0] = s.split.in_sample[0], (s) => s.strategy = "unknown"]) {
    await rejects((f) => { const s = json(f, p); mutate(s); set(f, p, s); }, /net r|sample ranges|strategy\/run/);
  }
  await rejects((f) => { const s = json(f, "lab/summary.json"); s.by_verdict.rejected++; set(f, "lab/summary.json", s); }, /Lab rejected/);
  await rejects((f) => { const s = json(f, "parity/2026-07-30.json"); s.live_r++; set(f, "parity/2026-07-30.json", s); }, /differs from index/);
});
