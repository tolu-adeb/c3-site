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
for (const p of ["/", "/track-record/", "/join/", "/app/", "/assets/site.css", "/robots.txt"]) {
  const r = await fetch(base + p);
  ok(r.status === 200, `GET ${p} -> ${r.status}`);
}
let r = await fetch(base + "/nope");
ok(r.status === 404 && (await r.text()).includes("Nothing here"), "unknown page -> styled 404");
r = await fetch(base + "/");
ok((r.headers.get("content-security-policy") || "").includes("default-src 'self'"), "security headers on pages");
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

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
