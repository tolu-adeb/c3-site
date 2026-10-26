import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validManifest, safePath, deletePrefix, collectOldBundles, readBounded } from "../src/publish.js";
const manifest = JSON.parse(await readFile(new URL("./fixtures/bundle/manifest.json", import.meta.url)));
test("publish manifests reject unknown fields, duplicates, private paths and invalid hashes", () => {
  assert.equal(validManifest(manifest, manifest.bundle), true);
  for (const change of [
    (m) => { m.secret_key = "private"; }, (m) => { m.files.push(m.files[0]); },
    (m) => { m.files[0].path = "../x.json"; }, (m) => { m.files[0].sha256 = "0"; },
    (m) => { m.files[0].sha256 = [m.files[0].sha256]; }, (m) => { m.files[0].bytes = 0; },
    (m) => { m.files = m.files.filter((f) => f.path !== "strategies.json"); },
    (m) => { m.featured.run = "missing"; }, (m) => { m.generated_at = "yesterday"; },
    (m) => { m.generated_at = "2026-02-30T00:00:00Z"; }, (m) => { m.featured.day = "2026-02-30"; }
  ]) { const value = structuredClone(manifest); change(value); assert.equal(validManifest(value, value.bundle), false); }
  for (const path of ["../x.json", "/x.json", "a//x.json", "a/./x.json", "x%2f.json", "a\\x.json"]) assert.equal(safePath(path), false, path);
});
function bucket(keys) {
  const objects = new Map(keys.map((key) => [key, "{}"]));
  return {
    objects,
    async get(key) { return objects.has(key) ? { json: async () => JSON.parse(objects.get(key)) } : null; },
    async list({ prefix, cursor = "", limit }) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix) && key > cursor).sort();
      return { objects: keys.slice(0, limit).map((key) => ({ key })), truncated: keys.length > limit, cursor: keys[Math.min(limit, keys.length) - 1] };
    },
    async delete(keys) { assert.ok(keys.length <= 100); keys.forEach((key) => objects.delete(key)); }
  };
}
test("prefix deletion paginates and leaves unrelated objects intact", async () => {
  const r2 = bucket([...Array.from({ length: 1005 }, (_, i) => `old/${String(i).padStart(5, "0")}.json`), "keep/a.json"]);
  await deletePrefix(r2, "old/");
  assert.deepEqual([...r2.objects.keys()], ["keep/a.json"]);
});
test("retention keeps current plus two previous bundles and deletes older live/staged objects", async () => {
  const r2 = bucket(["live/current.json", ...["a", "b", "c", "d"].flatMap((id) => [`live/${id}/manifest.json`, `staging/${id}/x.json`])]);
  r2.objects.set("live/current.json", JSON.stringify({ bundle: "b" }));
  const deleted = [];
  const DB = { prepare(sql) { return {
    all: async () => ({ results: ["d", "c", "b", "a"].map((id) => ({ id })) }),
    bind(id) { assert.match(sql, /DELETE/); return { run: async () => deleted.push(id) }; }
  }; } };
  await collectOldBundles({ DB, DATA: r2 });
  assert.deepEqual(deleted, ["a"]);
  assert.equal(r2.objects.has("live/a/manifest.json"), false);
  assert.equal(r2.objects.has("staging/a/x.json"), false);
  for (const id of ["b", "c", "d"]) assert.equal(r2.objects.has(`live/${id}/manifest.json`), true);
});
test("the upload reader stops a chunked request at its byte limit", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(64)); }, cancel() { cancelled = true; } });
  const body = await readBounded(new Request("https://local.test/", { method: "PUT", body: stream, duplex: "half" }), 100);
  assert.equal(body, null); assert.equal(cancelled, true);
});
