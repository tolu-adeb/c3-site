import { sha256hex, b64decode } from "./util.js";

const decode = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const missing = () => json({ error: "not found" }, 404);
const slug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100;
export const safePath = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9/_.-]{0,200}\.json$/.test(value) && !value.includes("..") && !value.split("/").some((part) => part === "." || !part);
export async function readBounded(request, limit) {
  if (Number(request.headers.get("content-length")) > limit) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
function exact(object, required, optional = []) {
  return object && typeof object === "object" && !Array.isArray(object) && required.every((key) => Object.hasOwn(object, key)) && Object.keys(object).every((key) => required.includes(key) || optional.includes(key));
}
function date(value) {
  return typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validManifest(manifest, bundle) {
  if (!exact(manifest, ["schema_version", "bundle", "generated_at", "c3lab_commit", "files", "runs", "featured"], ["synthetic"])) return false;
  if (manifest.schema_version !== 1 || manifest.bundle !== bundle || !slug(bundle) || typeof manifest.generated_at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(manifest.generated_at) || !Number.isFinite(Date.parse(manifest.generated_at)) || typeof manifest.c3lab_commit !== "string" || !/^[a-f0-9]{7,40}$/.test(manifest.c3lab_commit)) return false;
  if (!date(manifest.generated_at.slice(0, 10))) return false;
  if (Object.hasOwn(manifest, "synthetic") && manifest.synthetic !== true) return false;
  if (!Array.isArray(manifest.runs) || !manifest.runs.length || !manifest.runs.every(slug) || new Set(manifest.runs).size !== manifest.runs.length) return false;
  if (!exact(manifest.featured, ["run", "day"]) || !manifest.runs.includes(manifest.featured.run) || !date(manifest.featured.day)) return false;
  if (!Array.isArray(manifest.files) || !manifest.files.length) return false;
  const names = new Set();
  for (const file of manifest.files) {
    if (!exact(file, ["path", "sha256", "bytes"]) || !safePath(file.path) || file.path === "manifest.json" || names.has(file.path) || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isInteger(file.bytes) || file.bytes < 1 || file.bytes > 1500000) return false;
    if (/^runs\/[^/]+\/sessions\/\d{4}-\d\d-\d\d\.json$/.test(file.path) && file.bytes > 60000) return false;
    names.add(file.path);
  }
  return names.has("strategies.json") && names.has("lab/trials.json") && names.has("lab/summary.json") && names.has("parity/index.json") && names.has(`runs/${manifest.featured.run}/sessions/${manifest.featured.day}.json`) && manifest.runs.every((run) => ["summary", "trades", "equity", "monthly", "sessions/index"].every((file) => names.has(`runs/${run}/${file}.json`)));
}
export async function deletePrefix(bucket, prefix) {
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (let i = 0; i < page.objects.length; i += 100) await bucket.delete(page.objects.slice(i, i + 100).map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
export async function collectOldBundles(env) {
  const pointer = await env.DATA.get("live/current.json");
  if (!pointer) return;
  const { bundle } = await pointer.json();
  const { results } = await env.DB.prepare("SELECT id FROM publish_bundles WHERE state = 'committed' ORDER BY committed_ms DESC, id DESC").all();
  let retained = 0;
  for (const row of results) {
    if (row.id === bundle || retained++ < 2) continue;
    await deletePrefix(env.DATA, `live/${row.id}/`);
    await deletePrefix(env.DATA, `staging/${row.id}/`);
    await env.DB.prepare("DELETE FROM publish_bundles WHERE id = ?").bind(row.id).run();
  }
}

export async function publish(request, env, { checkSignature, ensureSchema }) {
  if (!env.DATA) return json({ error: "Publishing storage is not configured." }, 503);
  const url = new URL(request.url), action = url.pathname.slice("/api/publish/".length), bundle = url.searchParams.get("bundle");
  if (!["put", "commit", "abort"].includes(action)) return missing();
  if (request.method !== (action === "put" ? "PUT" : "POST")) return json({ error: "method not allowed" }, 405);
  if (!slug(bundle)) return json({ error: "Invalid bundle id." }, 400);
  if (action === "put" && !safePath(url.searchParams.get("path"))) return json({ error: "Invalid JSON path." }, 400);
  const bytes = await readBounded(request, action === "put" ? 5 * 1024 * 1024 : 1500000);
  if (!bytes) return json({ error: "too large" }, 413);
  const why = await checkSignature(request, env, bytes);
  if (why) return json({ error: why }, 401);
  if (action !== "abort" && request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "application/json required" }, 415);
  let value;
  if (action !== "abort") {
    try { value = JSON.parse(decode(bytes)); } catch { return json({ error: "Invalid UTF-8 JSON." }, 400); }
  }
  if (action === "commit" && !validManifest(value, bundle)) return json({ error: "Invalid bundle manifest." }, 400);
  await ensureSchema(env.DB);
  const receipt = await sha256hex(b64decode(request.headers.get("x-c3-signature")));
  const inserted = await env.DB.prepare("INSERT INTO publish_receipts (signature, ts) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(receipt, Number(request.headers.get("x-c3-timestamp"))).run();
  if (!inserted.meta.changes) return json({ error: "Replayed publish request." }, 409);
  const owner = crypto.randomUUID(), now = Date.now();
  const lock = await env.DB.prepare("INSERT INTO publish_lock (id, owner, expires_ms) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_ms = excluded.expires_ms WHERE publish_lock.expires_ms < ? RETURNING owner").bind(owner, now + 300000, now).first();
  if (!lock) return json({ error: "Publishing is busy. Retry with a fresh signature." }, 409);
  async function renew() {
    const result = await env.DB.prepare("UPDATE publish_lock SET expires_ms = ? WHERE id = 1 AND owner = ?").bind(Date.now() + 300000, owner).run();
    if (!result.meta.changes) throw new Error("Publish lease was lost");
  }
  try {
    const existing = await env.DB.prepare("SELECT state FROM publish_bundles WHERE id = ?").bind(bundle).first();
    if (existing?.state === "committed") return json({ error: "Committed bundles are immutable. Use a new bundle id." }, 409);
    if (action === "abort") {
      await deletePrefix(env.DATA, `staging/${bundle}/`);
      await deletePrefix(env.DATA, `live/${bundle}/`); // failed, unpublished commit copies only
      await env.DB.prepare("DELETE FROM publish_bundles WHERE id = ? AND state = 'staging'").bind(bundle).run();
      return json({ aborted: bundle });
    }
    await env.DB.prepare("INSERT INTO publish_bundles (id, state, updated_ms) VALUES (?, 'staging', ?) ON CONFLICT(id) DO UPDATE SET updated_ms = excluded.updated_ms").bind(bundle, now).run();
    if (action === "put") {
      const sha256 = await sha256hex(bytes);
      await renew();
      await env.DATA.put(`staging/${bundle}/${url.searchParams.get("path")}`, bytes, { httpMetadata: { contentType: "application/json; charset=utf-8" }, customMetadata: { sha256 } });
      return json({ bundle, path: url.searchParams.get("path"), sha256, bytes: bytes.byteLength });
    }
    // Verify and copy the exact bytes read, never a mutable staging reference.
    for (const file of value.files) {
      await renew();
      const object = await env.DATA.get(`staging/${bundle}/${file.path}`);
      if (!object) return json({ error: "Missing staged file.", path: file.path }, 409);
      if (object.size !== file.bytes) return json({ error: "Staged byte length differs.", path: file.path }, 409);
      const contents = new Uint8Array(await object.arrayBuffer());
      if (await sha256hex(contents) !== file.sha256) return json({ error: "Staged SHA-256 differs.", path: file.path }, 409);
      await env.DATA.put(`live/${bundle}/${file.path}`, contents, { httpMetadata: { contentType: "application/json; charset=utf-8" }, customMetadata: { sha256: file.sha256 } });
    }
    await renew();
    await env.DATA.put(`live/${bundle}/manifest.json`, bytes, { httpMetadata: { contentType: "application/json; charset=utf-8" }, customMetadata: { sha256: await sha256hex(bytes) } });
    const committed_ms = Date.now();
    await env.DB.prepare("UPDATE publish_bundles SET state = 'committed', committed_ms = ?, updated_ms = ?, manifest = ? WHERE id = ?").bind(committed_ms, committed_ms, decode(bytes), bundle).run();
    try {
      // R2 PUT is atomic. This is the only operation that makes the new bundle readable.
      await renew();
      await env.DATA.put("live/current.json", JSON.stringify({ bundle, committed_ms }));
    } catch (error) {
      const pointer = await env.DATA.get("live/current.json");
      if (!pointer || (await pointer.json()).bundle !== bundle) {
        await env.DB.prepare("UPDATE publish_bundles SET state = 'staging', committed_ms = NULL WHERE id = ?").bind(bundle).run();
        throw error;
      }
    }
    try {
      await deletePrefix(env.DATA, `staging/${bundle}/`);
      await collectOldBundles(env);
    } catch { console.warn("Published bundle is current; storage cleanup will retry on the next commit."); }
    return json({ committed: bundle, committed_ms });
  } finally {
    try { await env.DB.prepare("DELETE FROM publish_lock WHERE id = 1 AND owner = ?").bind(owner).run(); }
    catch { console.warn("Publish lease release failed; it expires after five minutes."); }
  }
}

export async function dataFile(request, env, privateView = false) {
  const url = new URL(request.url);
  if (!env.DATA || !privateView && (env.BACKTESTS_PUBLIC !== "true" || url.searchParams.has("staging"))) return missing();
  if (!["GET", "HEAD"].includes(request.method)) return json({ error: "GET or HEAD only" }, 405);
  const path = url.pathname.slice(privateView ? "/api/p/data/".length : "/data/".length);
  if (!safePath(path)) return missing();
  let prefix;
  if (privateView && url.searchParams.has("staging")) {
    const staging = url.searchParams.get("staging");
    if (!slug(staging)) return missing();
    prefix = `staging/${staging}/`;
  } else {
    const pointer = await env.DATA.get("live/current.json");
    if (!pointer) return missing();
    const { bundle } = await pointer.json();
    if (!slug(bundle)) return missing();
    prefix = `live/${bundle}/`;
  }
  const object = await env.DATA.get(prefix + path);
  if (!object) return missing();
  let body = object.body, hash = object.customMetadata?.sha256;
  if (!hash) { body = new Uint8Array(await object.arrayBuffer()); hash = await sha256hex(body); }
  const headers = { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": privateView ? "no-store" : "public, max-age=300", etag: `"${hash}"` };
  if (request.headers.get("if-none-match")?.split(",").some((tag) => tag.trim().replace(/^W\//, "") === headers.etag || tag.trim() === "*")) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

export async function publishedData(env) {
  if (!env.DATA) return json({ error: "Publishing storage is not configured." }, 503);
  const pointer = await env.DATA.get("live/current.json");
  const current = pointer ? await pointer.json() : null;
  const { results } = await env.DB.prepare("SELECT id, state, updated_ms, committed_ms, manifest FROM publish_bundles ORDER BY updated_ms DESC").all();
  const bundles = [];
  for (const row of results) {
    let files = [], preview_ready = false;
    if (row.state === "committed") {
      const manifest = JSON.parse(row.manifest);
      files = [...manifest.files];
      const stored = await env.DATA.head(`live/${row.id}/manifest.json`);
      if (stored) files.push({ path: "manifest.json", bytes: stored.size, sha256: stored.customMetadata?.sha256 || "" });
      preview_ready = current?.bundle === row.id;
    } else {
      let cursor;
      do {
        const page = await env.DATA.list({ prefix: `staging/${row.id}/`, cursor, limit: 1000, include: ["customMetadata"] });
        files.push(...page.objects.map((object) => ({ path: object.key.slice(`staging/${row.id}/`.length), bytes: object.size, sha256: object.customMetadata?.sha256 || "" })));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      const object = await env.DATA.get(`staging/${row.id}/manifest.json`);
      if (object) {
        const manifest = await object.json();
        preview_ready = validManifest(manifest, row.id) && manifest.files.every((file) => files.some((stored) => stored.path === file.path && stored.bytes === file.bytes && stored.sha256 === file.sha256));
      }
    }
    bundles.push({ id: row.id, state: row.state, updated_ms: row.updated_ms, committed_ms: row.committed_ms, files, preview_ready });
  }
  return json({ public: env.BACKTESTS_PUBLIC === "true", current, bundles });
}
