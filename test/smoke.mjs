// End-to-end check against `wrangler dev` (local workerd + local D1).
// Usage: node test/smoke.mjs <base-url> <keys.json>
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8787";
const keys = JSON.parse(readFileSync(process.argv[3], "utf8"));
const priv = createPrivateKey({ key: Buffer.from(keys.private_pkcs8_b64, "base64"), format: "der", type: "pkcs8" });
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

function signed(method, path, body, tsOverride) {
  const ts = tsOverride ?? Math.floor(Date.now() / 1000);
  const bytes = body == null ? Buffer.alloc(0) : Buffer.from(body);
  const msg = `${method}\n${path}\n${ts}\n${createHash("sha256").update(bytes).digest("hex")}`;
  const sig = sign(null, Buffer.from(msg), priv).toString("base64");
  return { "x-c3-timestamp": String(ts), "x-c3-signature": sig, "content-type": "application/json" };
}
async function push(kind, data, ts) {
  ts = ts ?? Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ kind, ts, data });
  return fetch(base + "/api/ingest", { method: "POST", headers: signed("POST", "/api/ingest", body, ts), body });
}
const view = { authorization: "Bearer " + keys.view_key };

// public pages
for (const p of ["/", "/track-record/", "/join/", "/app/", "/styleguide/", "/backtests/", "/replay/", "/engine/", "/methodology/", "/assets/site.css", "/robots.txt"]) {
  const r = await fetch(base + p);
  ok(r.status === 200, `GET ${p} -> ${r.status}`);
}
for (const id of ["", "orx/", "orb/", "sweep/", "vwap/", "nq-rev/", "nq-cont/"]) {
  const response = await fetch(base + "/strategies/" + id);
  ok(response.status === 200, `GET /strategies/${id} -> ${response.status}`);
}
let r = await fetch(base + "/nope");
ok(r.status === 404 && (await r.text()).includes("Nothing here"), "unknown page -> styled 404");
r = await fetch(base + "/");
ok((r.headers.get("content-security-policy") || "").includes("default-src 'self'"), "security headers on pages");
r = await fetch(base + "/styleguide/");
ok((r.headers.get("x-robots-tag") || "").includes("noindex") && (await r.text()).includes('name="robots" content="noindex, nofollow"'), "styleguide excluded from indexing");
r = await fetch(base + "/api/health");
ok((await r.json()).ok === true, "health");

// ingest: signed accepted, unsigned / tampered / stale / replayed rejected
const now = Math.floor(Date.now() / 1000);
r = await push("status", { running: true, tag: "SHADOW", stream: { enabled: true, connected: true }, alpha: { enabled: true, symbol: "MNQ=F" } }, now - 2);
ok(r.status === 200, `signed status push -> ${r.status}`);
r = await push("status", { running: true }, now - 2);
ok(r.status === 409, `replayed timestamp rejected -> ${r.status}`);
r = await fetch(base + "/api/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "status", ts: now, data: {} }) });
ok(r.status === 401, `unsigned push rejected -> ${r.status}`);
{
  const body = JSON.stringify({ kind: "status", ts: now, data: { running: false } });
  const h = signed("POST", "/api/ingest", body, now);
  r = await fetch(base + "/api/ingest", { method: "POST", headers: h, body: body.replace("false", "true ") });
  ok(r.status === 401, `tampered body rejected -> ${r.status}`);
}
r = await push("status", { running: true }, now - 1000);
ok(r.status === 401, `stale timestamp rejected -> ${r.status}`);
r = await push("snapshot", { alpha: { trades: [{ date: "2026-10-22", setup: "orx", side_label: "Short", entry: 26800, stop: 26850, pts: 40, r: 0.8 }] },
  events: [{ ts: "2026-10-22T10:15:00-04:00", title: "Entry short", delivered: "ok" }], parity: { summary: { judged: 1, matched: 0, rows: [{ day: "2026-10-22", verdict: "differs" }] } } });
ok(r.status === 200, `signed snapshot push -> ${r.status}`);
r = await push("track", { trades: 12, wins: 9, losses: 3, win_rate: 0.75, net_pts: 120.5, avg_r: 0.42, months: [{ month: "2026-10", trades: 12, net_usd: 230.1 }], secret_field: "x" });
ok(r.status === 200, `signed track push -> ${r.status}`);

// private views need the key
r = await fetch(base + "/api/p/overview");
ok(r.status === 401, "overview without key -> 401");
r = await fetch(base + "/api/p/overview", { headers: { authorization: "Bearer wrong-key-wrong-key-wrong" } });
ok(r.status === 401, "overview with wrong key -> 401");
r = await fetch(base + "/api/p/overview", { headers: view });
const ov = await r.json();
ok(r.status === 200 && ov.online === true && ov.status.data.tag === "SHADOW", "overview with key: online, latest status");
ok(Array.isArray(ov.coverage) && ov.coverage.length === 10, "coverage has 10 trading days");
ok(ov.snapshot && ov.snapshot.data.alpha.trades.length === 1, "snapshot stored");
r = await fetch(base + "/api/p/published");
ok(r.status === 401, "published inventory without key -> 401");
r = await fetch(base + "/api/p/published", { headers: view });
const published = await r.json();
ok(r.status === 200 && published.current === null && published.bundles.length === 0 && published.public === false, "private published inventory starts empty with public flag off");

// public track record: only whitelisted fields, only when public
r = await fetch(base + "/api/track");
const tr = await r.json();
ok(tr.public === true && tr.stats.trades === 12 && tr.stats.secret_field === undefined, "track record public and filtered");

// waitlist
const j = (b, ip) => fetch(base + "/api/join", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip || "198.51.100.7" }, body: JSON.stringify(b) });
r = await j({ email: "Test@Example.com", note: "hi" });
ok(r.status === 200, "join accepted");
r = await j({ email: "test@example.com" });
ok(r.status === 200, "duplicate join is quietly fine");
r = await j({ email: "not-an-email" });
ok(r.status === 400, "bad email rejected");
r = await j({ email: "bot@spam.example", website: "http://spam" });
ok(r.status === 200, "honeypot answers ok");
r = await fetch(base + "/api/p/waitlist", { headers: view });
let wl = await r.json();
ok(wl.signups.length === 1 && wl.signups[0].email === "test@example.com", "one signup stored, lowercased, honeypot dropped");
r = await fetch(base + "/api/p/waitlist.csv", { headers: view });
ok((await r.text()).startsWith("email,note,joined_utc\n\"test@example.com\""), "CSV export");
r = await fetch(base + "/api/p/waitlist/" + wl.signups[0].id, { method: "DELETE", headers: view });
ok((await r.json()).deleted === 1, "delete signup");
for (let i = 0; i < 6; i++) r = await j({ email: `x${i}@example.com` }, "203.0.113.9");
ok(r.status === 429, "rate limit after 5 tries an hour");

// TradingView front door
const hookBody = (o) => JSON.stringify({ v: 1, token: keys.webhook_token, sym: "NQ1!", t: 1791124260000, o: 1, h: 2, l: 0.5, c: 1.5, ...o });
const hk = (path, body, ip) => fetch(base + "/hook/" + path, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip || "52.89.214.238" }, body });
r = await hk(keys.webhook_path, hookBody({}));
ok(r.status === 200, `webhook accepted -> ${r.status}`);
r = await hk(keys.webhook_path, hookBody({}));
ok(r.status === 200, "webhook resend accepted (stored as duplicate)");
r = await hk("wrong-path", hookBody({}));
ok(r.status === 404, "wrong path -> 404");
r = await hk(keys.webhook_path, hookBody({ token: "nope" }));
ok(r.status === 403, "wrong token -> 403");
r = await hk(keys.webhook_path, hookBody({}), "1.2.3.4");
ok(r.status === 403, "IP not on TradingView list -> 403");
r = await fetch(base + "/api/hook/pull?after=0&limit=10", { headers: signed("GET", "/api/hook/pull?after=0&limit=10", null) });
const pull = await r.json();
ok(r.status === 200 && pull.webhooks.length === 2 && pull.webhooks[1].dup === 1 && JSON.parse(pull.webhooks[0].raw).t === 1791124260000, "signed pull returns exact payloads with dup flag");
r = await fetch(base + "/api/hook/pull?after=0");
ok(r.status === 401, "unsigned pull rejected");

// command queue: site stores, bot pulls (signed) and acks (signed)
{
  const ts = Math.floor(Date.now() / 1000);
  const cmd = (o) => fetch(base + "/api/p/commands", { method: "POST", headers: { ...view, "content-type": "application/json" }, body: JSON.stringify({ action: "run_parity", args: {}, nonce: "x".repeat(22) + Math.random().toString(36).slice(2, 8), ts, mac: "a".repeat(64), ...o }) });
  r = await cmd({ action: "post_to_discord" });
  ok(r.status === 400, "unknown command action rejected");
  r = await fetch(base + "/api/p/commands", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  ok(r.status === 401, "command without view key rejected");
  r = await cmd({ ts: ts - 3600 });
  ok(r.status === 400, "command with a stale clock rejected");
  r = await cmd({});
  const added = await r.json();
  ok(r.status === 200 && added.id > 0, "command queued");
  r = await fetch(base + "/api/cmd/pull");
  ok(r.status === 401, "unsigned command pull rejected");
  r = await fetch(base + "/api/cmd/pull", { headers: signed("GET", "/api/cmd/pull", null) });
  const pulled = await r.json();
  ok(pulled.commands.some((c) => c.id === added.id && c.mac === "a".repeat(64)), "bot pulls the command with its signature");
  r = await fetch(base + "/api/cmd/pull", { headers: signed("GET", "/api/cmd/pull", null) });
  ok(!(await r.json()).commands.some((c) => c.id === added.id), "a pulled command isn't handed out twice");
  const ack = JSON.stringify({ id: added.id, ok: false, refused: true, message: "refused: wrong control code" });
  r = await fetch(base + "/api/cmd/ack", { method: "POST", headers: signed("POST", "/api/cmd/ack", ack), body: ack });
  ok(r.status === 200, "signed ack accepted");
  r = await fetch(base + "/api/p/commands", { headers: view });
  const listed = (await r.json()).commands.find((c) => c.id === added.id);
  ok(listed && listed.status === "refused" && listed.result.includes("wrong control code"), "command result visible on the dashboard");
}

// research papers: upload (view key), signed pull + blob for the bot, signed status/result push, delete, daily cap
{
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3 * 1024 * 1024 + 123, 7), Buffer.from("\n%%EOF\n")]);  // 3 chunks
  const sha = createHash("sha256").update(pdf).digest("hex");
  const up = (bytes, name, headers) => {
    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type: "application/pdf" }), name);
    fd.append("note", "does the gap help?");
    return fetch(base + "/api/p/papers", { method: "POST", headers: headers || view, body: fd });
  };
  const link = (o, headers) => fetch(base + "/api/p/papers", { method: "POST", headers: { ...(headers || view), "content-type": "application/json" }, body: JSON.stringify(o) });
  r = await up(pdf, "x.pdf", {});
  ok(r.status === 401, "paper upload without view key -> 401");
  r = await up(Buffer.from("<html>not a pdf</html>"), "x.pdf");
  ok(r.status === 400, "non-PDF upload rejected");
  r = await up(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(21 * 1024 * 1024)]), "big.pdf");
  ok(r.status === 413, `21 MB upload rejected -> ${r.status}`);
  r = await up(pdf, "Gap_filters-2024.pdf");
  const added = await r.json();
  ok(r.status === 200 && added.sha256 === sha && added.kind === "pdf", "PDF upload accepted, hash returned");
  r = await up(pdf, "again.pdf");
  ok(r.status === 409, "the same PDF twice -> 409");
  r = await link({ kind: "arxiv", ref: "https://arxiv.org/abs/2106.01234v2" });
  const ax = await r.json();
  ok(r.status === 200 && ax.sha256 === createHash("sha256").update("arxiv\n2106.01234v2").digest("hex"), "arXiv link normalised, hash of kind+ref");
  r = await link({ kind: "doi", ref: "not a doi" });
  ok(r.status === 400, "bad DOI rejected");
  r = await link({ kind: "pdf", ref: "x" });
  ok(r.status === 400, "JSON can't claim to be a PDF");

  r = await fetch(base + "/api/p/papers", { headers: view });
  let list = await r.json();
  let mine = list.papers.find((p) => p.id === added.id);
  ok(mine && mine.title === "Gap filters 2024" && mine.status === "uploaded" && mine.bytes === pdf.length && mine.note === "does the gap help?", "paper listed with title from file name");

  // analyse command marks it queued; a refusal by the bot marks it failed with the reason
  const ts = Math.floor(Date.now() / 1000);
  r = await fetch(base + "/api/p/commands", { method: "POST", headers: { ...view, "content-type": "application/json" },
    body: JSON.stringify({ action: "analyze_paper", args: { paper_id: ax.id, sha256: ax.sha256 }, nonce: "p".repeat(20) + ts, ts, mac: "b".repeat(64) }) });
  const pc = await r.json();
  r = await fetch(base + "/api/p/papers", { headers: view });
  ok((await r.json()).papers.find((p) => p.id === ax.id).status === "queued", "analyze command marks the paper queued");
  const ack = JSON.stringify({ id: pc.id, ok: false, refused: true, message: "refused: wrong control code" });
  await fetch(base + "/api/cmd/ack", { method: "POST", headers: signed("POST", "/api/cmd/ack", ack), body: ack });
  r = await fetch(base + "/api/p/papers", { headers: view });
  const failed = (await r.json()).papers.find((p) => p.id === ax.id);
  ok(failed.status === "failed" && failed.error.includes("wrong control code"), "bot refusal shows on the paper");

  // the bot's side
  r = await fetch(base + `/api/papers/pull?id=${added.id}`);
  ok(r.status === 401, "unsigned paper pull rejected");
  r = await fetch(base + `/api/papers/pull?id=${added.id}`, { headers: signed("GET", `/api/papers/pull?id=${added.id + 1}`, null) });
  ok(r.status === 401, "paper pull signed for another URL rejected");
  r = await fetch(base + `/api/papers/pull?id=${added.id}`, { headers: signed("GET", `/api/papers/pull?id=${added.id}`, null, ts - 1000) });
  ok(r.status === 401, "stale paper pull rejected");
  r = await fetch(base + `/api/papers/pull?id=${added.id}`, { headers: signed("GET", `/api/papers/pull?id=${added.id}`, null) });
  const meta = (await r.json()).paper;
  ok(meta && meta.sha256 === sha && meta.source_kind === "pdf" && meta.note === "does the gap help?", "signed pull returns the paper's metadata");
  r = await fetch(base + `/api/papers/blob/${added.id}`);
  ok(r.status === 401, "unsigned blob download rejected");
  r = await fetch(base + `/api/papers/blob/${added.id}`, { headers: signed("GET", `/api/papers/blob/${added.id}`, null) });
  const got = Buffer.from(await r.arrayBuffer());
  ok(r.status === 200 && got.equals(pdf) && r.headers.get("x-c3-sha256") === sha, "signed blob download is byte-identical (3 chunks)");

  const result = { summary: "They filter by the gap and report a higher win rate after costs.", grade: { letter: "B" },
    testable: [{ id: "t1", name: "Trade with the gap", changes: { orx_gap_mode: "with" }, state: "new" }] };
  r = await push("papers", { items: [{ id: added.id, status: "reading", stored: true }] }, ts - 3);
  ok(r.status === 200, "signed papers push accepted");
  r = await fetch(base + `/api/papers/blob/${added.id}`, { headers: signed("GET", `/api/papers/blob/${added.id}`, null) });
  ok(r.status === 410, "file deleted from the site once the bot has it");
  r = await push("papers", { items: [{ id: added.id, status: "done", title: "Ignored: the site keeps your title", result }] }, ts - 2);
  ok(r.status === 200, "result push accepted");
  r = await push("papers", { items: [{ id: "x", status: "done" }] }, ts - 1);
  ok(r.status === 400, "malformed papers push rejected");
  r = await push("papers", { items: [{ id: added.id, status: "failed" }] }, ts - 2);
  ok(r.status === 409, "replayed papers push rejected");
  r = await fetch(base + "/api/p/papers", { headers: view });
  mine = (await r.json()).papers.find((p) => p.id === added.id);
  ok(mine.status === "done" && mine.title === "Gap filters 2024" && mine.result.testable[0].changes.orx_gap_mode === "with", "analysis visible on the dashboard");

  r = await fetch(base + `/api/p/papers/${ax.id}`, { method: "DELETE", headers: view });
  ok((await r.json()).deleted === 1, "delete a paper");
  r = await fetch(base + `/api/p/papers/${added.id}`, { method: "DELETE" });
  ok(r.status === 401, "delete without view key rejected");

  // daily cap: 10 in 24 hours (2 added above, 1 deleted still counts as removed)
  let last;
  for (let i = 0; i < 12; i++) last = await link({ kind: "url", ref: `https://example.com/p${i}-${ts}.pdf` });
  ok(last.status === 429, `daily paper limit -> ${last.status}`);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
