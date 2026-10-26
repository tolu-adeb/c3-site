import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readBundle } from "./lib/bundle.mjs";
import { FIXTURE_DIR } from "./make-fixtures.mjs";
import { publisher } from "./lib/publish.mjs";
const [base, keyFile, phase = "private"] = process.argv.slice(2);
const api = await publisher(base, keyFile), files = await readBundle(FIXTURE_DIR);
const original = JSON.parse(files.get("manifest.json"));
let checks = 0;
const status = async (response, expected, label) => { assert.equal(response.status, expected, `${label}: ${await response.text()}`); checks++; };
const current = async () => { const r = await api.read("manifest.json"); return r.status === 404 ? null : (await r.json()).bundle; };
if (phase === "public") {
  const response = await fetch(base + "/data/manifest.json");
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(JSON.parse(bytes).bundle, "publish-retention-4");
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.equal(response.headers.get("etag"), `"${hash}"`);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  await status(await fetch(base + "/data/manifest.json", { headers: { "if-none-match": `"${hash}"` } }), 304, "strong ETag");
  await status(await fetch(base + "/data/manifest.json", { method: "HEAD" }), 200, "HEAD");
  await status(await fetch(base + "/data/manifest.json?staging=preview-bundle"), 404, "public staging denied");
  await status(await fetch(base + "/data/not-here.json"), 404, "missing file");
  for (const file of original.files) {
    const r = await fetch(base + "/data/" + file.path), actual = Buffer.from(await r.arrayBuffer());
    assert.equal(r.status, 200, file.path);
    assert.equal(actual.length, file.bytes);
    assert.equal(createHash("sha256").update(actual).digest("hex"), file.sha256);
    checks++;
  }
  console.log(`Publish public: ${checks} checks passed; all live files match the signed inventory.`);
  process.exit(0);
}
await status(await fetch(base + "/data/manifest.json"), 404, "public flag off");
await status(await fetch(base + "/api/p/data/manifest.json"), 401, "view key required");
await status(await fetch(base + "/api/p/data/manifest.json", { headers: { authorization: "Bearer wrong-key" } }), 401, "wrong view key");
for (const action of ["commit", "abort"]) await status(await fetch(base + `/api/publish/${action}?bundle=first-bundle`, { method: "POST", body: JSON.stringify({ ...original, bundle: "first-bundle" }), headers: { "content-type": "application/json" } }), 401, `unsigned ${action}`);
await status(await fetch(base + "/api/publish/put?bundle=first-bundle&path=a.json", { method: "PUT", body: "{}", headers: { "content-type": "application/json" } }), 401, "unsigned");
await status(await api.send("PUT", "/api/publish/put?bundle=first-bundle&path=a.json", "{}", { ts: Math.floor(Date.now() / 1000) - 400 }), 401, "stale");
await status(await api.send("PUT", "/api/publish/put?bundle=first-bundle&path=a.json", "{}", { ts: Math.floor(Date.now() / 1000) + 400 }), 401, "future timestamp");
{
  const path = "/api/publish/put?bundle=first-bundle&path=a.json";
  await status(await fetch(base + path, { method: "PUT", headers: api.headers("PUT", path, "{}"), body: "[]" }), 401, "tampered body");
  const body = "{}", headers = api.headers("PUT", path, body);
  await status(await fetch(base + path, { method: "PUT", headers, body }), 200, "signed upload");
  await status(await fetch(base + path, { method: "PUT", headers, body }), 409, "replay");
  await status(await fetch(base + path + "&tampered=1", { method: "PUT", headers, body }), 401, "tampered query");
}
for (const path of ["../outside.json", "/outside.json", "a/../../x.json", "a//b.json", "a/./b.json", "a.txt", "a%2fb.json"]) {
  await status(await api.put("first-bundle", path, "{}"), 400, `unsafe path ${path}`);
}
await status(await api.put("../bad", "a.json", "{}"), 400, "unsafe bundle");
await status(await api.put("first-bundle", "bad.json", "{"), 400, "invalid JSON");
await status(await api.send("PUT", "/api/publish/put?bundle=first-bundle&path=bad.json", "{}", { headers: { "content-type": "text/plain" } }), 415, "content type");
await status(await api.put("first-bundle", "big.json", " ".repeat(5 * 1024 * 1024 + 1)), 413, "oversize");
await status(await api.read("a.json", "first-bundle"), 200, "private staging");
await status(await fetch(base + "/data/a.json?staging=first-bundle"), 404, "staging never public");
await status(await api.send("POST", "/api/publish/abort?bundle=first-bundle"), 200, "abort");
await status(await api.read("a.json", "first-bundle"), 404, "abort removes staging");
assert.equal(await current(), null);
const first = { ...original, bundle: "publish-first" };
await status(await api.commit(first.bundle, first), 409, "commit missing file");
assert.equal(await current(), null);
async function stage(manifest) {
  for (const file of manifest.files) {
    const r = await api.put(manifest.bundle, file.path, files.get(file.path));
    assert.equal(r.status, 200, `stage ${file.path}: ${await r.text()}`);
  }
  await status(await api.put(manifest.bundle, "manifest.json", Buffer.from(JSON.stringify(manifest))), 200, "stage manifest");
}
await stage(first);
const wrong = structuredClone(first); wrong.files[0].sha256 = "f".repeat(64);
await status(await api.commit(first.bundle, wrong), 409, "commit wrong hash");
assert.equal(await current(), null);
const wrongBytes = structuredClone(first); wrongBytes.files[0].bytes++;
await status(await api.commit(first.bundle, wrongBytes), 409, "commit wrong bytes");
assert.equal(await current(), null);
await status(await api.commit(first.bundle, { ...first, full_params: {} }), 400, "unknown manifest fields");
const raced = await Promise.all([api.commit(first.bundle, first), api.commit(first.bundle, first)]);
assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409], "Concurrent commits have a single winner");
checks += 2;
assert.equal(await current(), first.bundle);
await status(await api.put(first.bundle, "strategies.json", "[]"), 409, "live bundle immutable");
await status(await api.send("POST", `/api/publish/abort?bundle=${first.bundle}`), 409, "cannot abort current bundle");
const privateRead = await api.read("manifest.json"); assert.equal(privateRead.headers.get("cache-control"), "no-store");
const bad = { ...original, bundle: "failed-next" };
await status(await api.commit(bad.bundle, bad), 409, "later failed commit");
assert.equal(await current(), first.bundle, "failed commits leave pointer unchanged");
for (let i = 1; i <= 4; i++) {
  const manifest = { ...original, bundle: `publish-retention-${i}` };
  await stage(manifest);
  await status(await api.commit(manifest.bundle, manifest), 200, "retention commit " + i);
}
await stage({ ...original, bundle: "preview-bundle" });
assert.equal(await current(), "publish-retention-4");
await status(await fetch(base + "/data/manifest.json"), 404, "flag stays off after commit");
console.log(`Publish private: ${checks} cases passed, including auth, traversal, integrity, preview, abort and atomic pointer changes.`);
