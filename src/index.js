// c3.lab site Worker.
//
// Public:   /, /track-record/, /join/  (static files in public/)
//           GET  /api/health            - liveness
//           GET  /api/track             - public results, only when TRACK_RECORD_PUBLIC is "true"
//           POST /api/join              - waitlist signup
// Bot:      POST /api/ingest            - status / snapshot / track pushes, signed with the bot's Ed25519 key
//           GET  /api/hook/pull         - signed; the receiver collects stored TradingView webhooks
//           GET  /api/cmd/pull, POST /api/cmd/ack - signed; the bot collects dashboard commands and reports results
// Private:  /app/                      - dashboard shell; data needs the view key (secret link)
//           GET  /api/p/overview, /api/p/waitlist(.csv), DELETE /api/p/waitlist/:id, GET /api/p/webhooks
//           GET/POST /api/p/commands    - queue a command for the bot (it verifies the control code, not the site)
// Webhooks: POST /hook/<secret path>   - TradingView front door, off unless WEBHOOK_ENABLED is "true"
//
// No secrets live here: the bot's PUBLIC key and SHA-256 hashes of the view key / webhook path / token are
// plain vars in wrangler.jsonc.  The private halves stay in the bot's local .env.

import { SCHEMA } from "./schema.js";
import { b64decode, sha256hex, timingSafeEqualHex, etParts } from "./util.js";

const enc = new TextEncoder();
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const KINDS = new Set(["status", "snapshot", "track"]);
const MAX_INGEST_BYTES = 768 * 1024;
const MAX_HOOK_BYTES = 64 * 1024;
const ONLINE_MS = 3 * 60 * 1000;
const DAY_MS = 86400000;

export const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...extra } });
const notFound = () => json({ error: "not found" }, 404);

let schemaReady = null;
function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

let botKeyPromise = null;
function botKey(env) {
  if (!botKeyPromise) {
    botKeyPromise = crypto.subtle
      .importKey("raw", b64decode(env.BOT_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"])
      .catch((e) => {
        botKeyPromise = null;
        throw e;
      });
  }
  return botKeyPromise;
}

// The bot signs: METHOD \n path?query \n unix-seconds \n sha256(body).  Returns null when valid, else a reason.
export async function checkSignature(request, env, body) {
  const ts = Number(request.headers.get("x-c3-timestamp"));
  const sig = request.headers.get("x-c3-signature");
  if (!env.BOT_PUBLIC_KEY) return "signing not set up";
  if (!Number.isInteger(ts) || !sig) return "unsigned";
  if (Math.abs(Date.now() / 1000 - ts) > 300) return "timestamp too far from now";
  const url = new URL(request.url);
  const msg = `${request.method}\n${url.pathname}${url.search}\n${ts}\n${await sha256hex(body)}`;
  try {
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, await botKey(env), b64decode(sig), enc.encode(msg));
    return ok ? null : "bad signature";
  } catch {
    return "bad signature";
  }
}

async function viewerOk(request, env) {
  const h = request.headers.get("authorization") || "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!key || !env.VIEW_KEY_SHA256) return false;
  return timingSafeEqualHex(await sha256hex(enc.encode(key)), env.VIEW_KEY_SHA256.toLowerCase());
}

async function readBody(request, limit) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > limit) return null;
  const buf = new Uint8Array(await request.arrayBuffer());
  return buf.byteLength > limit ? null : buf;
}

// ---------- bot ingest ----------

async function ingest(request, env) {
  const body = await readBody(request, MAX_INGEST_BYTES);
  if (!body) return json({ error: "too large" }, 413);
  const why = await checkSignature(request, env, body);
  if (why) return json({ error: why }, 401);
  let msg;
  try {
    msg = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json({ error: "not json" }, 400);
  }
  const ts = Number(request.headers.get("x-c3-timestamp"));
  if (!msg || !KINDS.has(msg.kind) || msg.ts !== ts || typeof msg.data !== "object" || msg.data === null) {
    return json({ error: "expected {kind, ts, data}" }, 400);
  }
  await ensureSchema(env.DB);
  const prev = await env.DB.prepare("SELECT ts FROM latest WHERE kind = ?").bind(msg.kind).first();
  if (prev && prev.ts >= ts) return json({ error: "older than what is stored" }, 409);
  const now = Date.now();
  const stmts = [
    env.DB.prepare(
      "INSERT INTO latest (kind, ts, received_ms, body) VALUES (?1, ?2, ?3, ?4) " +
        "ON CONFLICT(kind) DO UPDATE SET ts = ?2, received_ms = ?3, body = ?4"
    ).bind(msg.kind, ts, now, JSON.stringify(msg.data)),
  ];
  if (msg.kind === "status") {
    const d = msg.data;
    const alpha = d.alpha || {};  // d.tag: the bot's ALPHA_TAG (SHADOW while testing)
    stmts.push(
      env.DB.prepare("INSERT OR REPLACE INTO heartbeats (received_ms, ts, running, stream, mode) VALUES (?, ?, ?, ?, ?)").bind(
        now,
        ts,
        d.running ? 1 : 0,
        d.stream && d.stream.connected ? 1 : 0,
        String(d.tag || (alpha.enabled ? "on" : "off")).slice(0, 24)
      )
    );
  }
  await env.DB.batch(stmts);
  return json({ ok: true, kind: msg.kind });
}

// ---------- private views ----------

function coverageDays(rows, now, days = 10) {
  // rows: [{received_ms}] newest first.  Session window 09:25-16:00 ET, counted in whole minutes.
  const byDay = new Map();
  for (const r of rows) {
    const p = etParts(r.received_ms);
    if (p.minutes < 565 || p.minutes >= 960) continue;
    if (!byDay.has(p.date)) byDay.set(p.date, new Set());
    byDay.get(p.date).add(p.minutes);
  }
  const out = [];
  const today = etParts(now);
  for (let i = 0; out.length < days && i < days * 2 + 4; i++) {
    const p = etParts(now - i * DAY_MS);
    if (p.weekday === "Sat" || p.weekday === "Sun") continue;
    if (p.date === today.date && today.minutes < 565) continue;
    const mins = byDay.get(p.date) || new Set();
    const end = p.date === today.date ? Math.min(today.minutes + 1, 960) : 960;
    const span = Math.max(1, end - 565);
    // a check-in every minute; allow one missed beat either side
    let covered = 0;
    for (let m = 565; m < end; m++) if (mins.has(m) || mins.has(m - 1) || mins.has(m + 1)) covered++;
    let sawOpen = false;
    for (let m = 565; m <= 570; m++) if (mins.has(m)) sawOpen = true;
    out.push({ day: p.date, pct: Math.round((1000 * covered) / span) / 10, saw_open: sawOpen, so_far: p.date === today.date });
  }
  return out;
}

async function overview(env) {
  await ensureSchema(env.DB);
  const now = Date.now();
  const [latest, beats, firstBeat, wl, hooks] = await env.DB.batch([
    env.DB.prepare("SELECT kind, ts, received_ms, body FROM latest"),
    env.DB.prepare("SELECT received_ms FROM heartbeats WHERE received_ms > ? ORDER BY received_ms DESC").bind(now - 16 * DAY_MS),
    env.DB.prepare("SELECT MIN(received_ms) AS first FROM heartbeats"),
    env.DB.prepare("SELECT COUNT(*) AS n, MAX(created_ms) AS last FROM waitlist"),
    env.DB.prepare("SELECT COUNT(*) AS n, MAX(received_ms) AS last, SUM(dup) AS dups FROM webhooks"),
  ]);
  const by = {};
  for (const r of latest.results) by[r.kind] = { ts: r.ts, received_ms: r.received_ms, data: JSON.parse(r.body) };
  const last = by.status ? by.status.received_ms : null;
  return json({
    now,
    online: last !== null && now - last < ONLINE_MS,
    last_seen_ms: last,
    first_seen_ms: firstBeat.results[0] ? firstBeat.results[0].first : null,
    coverage: coverageDays(beats.results, now),
    status: by.status || null,
    snapshot: by.snapshot || null,
    track: by.track || null,
    waitlist: wl.results[0],
    webhooks: { ...hooks.results[0], enabled: env.WEBHOOK_ENABLED === "true" },
    track_public: env.TRACK_RECORD_PUBLIC === "true",
  });
}

async function waitlistList(env, csv) {
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare("SELECT id, email, note, created_ms FROM waitlist ORDER BY created_ms DESC LIMIT 2000").all();
  if (!csv) return json({ signups: results });
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["email,note,joined_utc", ...results.map((r) => [q(r.email), q(r.note), q(new Date(r.created_ms).toISOString())].join(","))];
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="c3-waitlist.csv"', "cache-control": "no-store" },
  });
}

async function waitlistDelete(env, id) {
  await ensureSchema(env.DB);
  const r = await env.DB.prepare("DELETE FROM waitlist WHERE id = ?").bind(id).run();
  return json({ ok: true, deleted: r.meta.changes || 0 });
}

async function webhookList(env) {
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare("SELECT id, sym, t, dup, received_ms FROM webhooks ORDER BY id DESC LIMIT 50").all();
  return json({ enabled: env.WEBHOOK_ENABLED === "true", recent: results });
}

// ---------- public ----------

const EMAIL = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

async function join(request, env) {
  const body = await readBody(request, 4096);
  if (!body) return json({ error: "Too large." }, 413);
  let f;
  try {
    f = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json({ error: "Send the form as JSON." }, 400);
  }
  if (f.website) return json({ ok: true }); // honeypot: bots fill every field
  const email = String(f.email || "").trim().toLowerCase();
  const note = String(f.note || "").trim().slice(0, 280);
  if (email.length > 254 || !EMAIL.test(email)) return json({ error: "That email address doesn't look right." }, 400);
  await ensureSchema(env.DB);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = (await sha256hex(enc.encode(`${ip}|${env.VIEW_KEY_SHA256 || "c3"}`))).slice(0, 32);
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM join_attempts WHERE ip_hash = ? AND at_ms > ?").bind(ipHash, now - 3600000).first();
  if (recent && recent.n >= 5) return json({ error: "Too many tries from this connection. Try again in an hour." }, 429);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO join_attempts (ip_hash, at_ms) VALUES (?, ?)").bind(ipHash, now),
    env.DB.prepare("INSERT INTO waitlist (email, note, created_ms, ip_hash) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING").bind(email, note || null, now, ipHash),
  ]);
  return json({ ok: true });
}

const TRACK_FIELDS = ["trades", "wins", "losses", "win_rate", "net_pts", "avg_r", "max_dd_usd", "net_usd", "first", "last", "months", "label", "since"];

async function track(env) {
  if (env.TRACK_RECORD_PUBLIC !== "true") return json({ public: false });
  await ensureSchema(env.DB);
  const r = await env.DB.prepare("SELECT received_ms, body FROM latest WHERE kind = 'track'").first();
  if (!r) return json({ public: true, stats: null });
  const d = JSON.parse(r.body);
  const stats = {};
  for (const k of TRACK_FIELDS) if (d[k] !== undefined) stats[k] = d[k];
  return json({ public: true, updated_ms: r.received_ms, stats }, 200, { "cache-control": "public, max-age=120" });
}

// ---------- TradingView front door ----------

async function hook(request, env, rest) {
  if (env.WEBHOOK_ENABLED !== "true" || !env.WEBHOOK_PATH_SHA256 || !env.WEBHOOK_TOKEN_SHA256) return notFound();
  if (!timingSafeEqualHex(await sha256hex(enc.encode(rest)), env.WEBHOOK_PATH_SHA256.toLowerCase())) return notFound();
  const allowed = String(env.TRADINGVIEW_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = request.headers.get("cf-connecting-ip") || "";
  if (!allowed.includes(ip)) return json({ error: "forbidden" }, 403);
  const body = await readBody(request, MAX_HOOK_BYTES);
  if (!body) return json({ error: "too large" }, 413);
  const raw = new TextDecoder().decode(body);
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    return json({ error: "forbidden" }, 403);
  }
  const tokOk = typeof p.token === "string" && timingSafeEqualHex(await sha256hex(enc.encode(p.token)), env.WEBHOOK_TOKEN_SHA256.toLowerCase());
  if (!tokOk || p.v !== 1 || typeof p.sym !== "string" || p.sym.length > 24 || !Number.isInteger(p.t)) return json({ error: "forbidden" }, 403);
  await ensureSchema(env.DB);
  const seen = await env.DB.prepare("SELECT 1 AS x FROM webhooks WHERE sym = ? AND t = ? LIMIT 1").bind(p.sym, p.t).first();
  await env.DB.prepare("INSERT INTO webhooks (received_ms, sym, t, dup, raw) VALUES (?, ?, ?, ?, ?)").bind(Date.now(), p.sym, p.t, seen ? 1 : 0, raw).run();
  return json({ ok: true });
}

async function hookPull(request, env, url) {
  const why = await checkSignature(request, env, new Uint8Array());
  if (why) return json({ error: why }, 401);
  await ensureSchema(env.DB);
  const after = Math.max(0, Number(url.searchParams.get("after") || 0) | 0);
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 500) | 0));
  const { results } = await env.DB.prepare("SELECT id, received_ms, sym, t, dup, raw FROM webhooks WHERE id > ? ORDER BY id LIMIT ?").bind(after, limit).all();
  return json({ webhooks: results, next_after: results.length ? results[results.length - 1].id : after });
}

// ---------- commands (site queues; the bot verifies the control-code HMAC and runs them) ----------

const ACTIONS = new Set(["pause_posting", "resume_posting", "approve_strategy", "retire_strategy", "run_forward_lab", "run_parity", "run_wide_backtest"]);
const CMD_MAX_AGE_MS = 10 * 60 * 1000;

async function commandAdd(request, env) {
  const body = await readBody(request, 4096);
  if (!body) return json({ error: "Too large." }, 413);
  let c;
  try {
    c = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  const now = Date.now();
  if (!ACTIONS.has(c.action)) return json({ error: "Unknown action." }, 400);
  if (typeof c.nonce !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(c.nonce)) return json({ error: "Bad nonce." }, 400);
  if (!Number.isInteger(c.ts) || Math.abs(now / 1000 - c.ts) > 300) return json({ error: "Your device clock looks off." }, 400);
  if (typeof c.mac !== "string" || !/^[0-9a-f]{64}$/.test(c.mac)) return json({ error: "Missing control code signature." }, 400);
  const args = JSON.stringify(c.args && typeof c.args === "object" ? c.args : {});
  if (args.length > 1000) return json({ error: "Too large." }, 413);
  await ensureSchema(env.DB);
  const r = await env.DB.prepare("INSERT INTO commands (action, args, nonce, ts, mac, created_ms) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(nonce) DO NOTHING")
    .bind(c.action, args, c.nonce, c.ts, c.mac, now).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

async function commandList(env) {
  await ensureSchema(env.DB);
  const now = Date.now();
  await env.DB.prepare("UPDATE commands SET status = 'expired', done_ms = ? WHERE status = 'pending' AND created_ms < ?").bind(now, now - CMD_MAX_AGE_MS).run();
  const { results } = await env.DB.prepare("SELECT id, action, args, created_ms, status, result, done_ms FROM commands ORDER BY id DESC LIMIT 30").all();
  return json({ commands: results.map((r) => ({ ...r, args: JSON.parse(r.args) })) });
}

async function commandPull(request, env) {
  const why = await checkSignature(request, env, new Uint8Array());
  if (why) return json({ error: why }, 401);
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare("SELECT id, action, args, nonce, ts, mac FROM commands WHERE status = 'pending' AND created_ms > ? ORDER BY id LIMIT 10")
    .bind(Date.now() - CMD_MAX_AGE_MS).all();
  if (results.length) {
    await env.DB.batch(results.map((r) => env.DB.prepare("UPDATE commands SET status = 'sent' WHERE id = ? AND status = 'pending'").bind(r.id)));
  }
  return json({ commands: results.map((r) => ({ ...r, args: JSON.parse(r.args) })) });
}

async function commandAck(request, env) {
  const body = await readBody(request, 8192);
  if (!body) return json({ error: "too large" }, 413);
  const why = await checkSignature(request, env, body);
  if (why) return json({ error: why }, 401);
  let a;
  try {
    a = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json({ error: "not json" }, 400);
  }
  if (!Number.isInteger(a.id)) return json({ error: "id" }, 400);
  await ensureSchema(env.DB);
  const status = a.refused ? "refused" : a.ok ? "done" : "failed";
  await env.DB.prepare("UPDATE commands SET status = ?, result = ?, done_ms = ? WHERE id = ?").bind(status, String(a.message || "").slice(0, 500), Date.now(), a.id).run();
  return json({ ok: true });
}

// ---------- router ----------

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const m = request.method;

  if (path.startsWith("/hook/")) return m === "POST" ? hook(request, env, path.slice(6)) : notFound();
  if (path === "/api/health") return json({ ok: true });
  if (path === "/api/ingest") return m === "POST" ? ingest(request, env) : json({ error: "POST only" }, 405);
  if (path === "/api/join") return m === "POST" ? join(request, env) : json({ error: "POST only" }, 405);
  if (path === "/api/track") return track(env);
  if (path === "/api/hook/pull") return m === "GET" ? hookPull(request, env, url) : json({ error: "GET only" }, 405);
  if (path === "/api/cmd/pull") return m === "GET" ? commandPull(request, env) : json({ error: "GET only" }, 405);
  if (path === "/api/cmd/ack") return m === "POST" ? commandAck(request, env) : json({ error: "POST only" }, 405);

  if (path.startsWith("/api/p/")) {
    if (!(await viewerOk(request, env))) return json({ error: "This link isn't valid." }, 401);
    if (path === "/api/p/overview" && m === "GET") return overview(env);
    if (path === "/api/p/waitlist" && m === "GET") return waitlistList(env, false);
    if (path === "/api/p/waitlist.csv" && m === "GET") return waitlistList(env, true);
    const del = path.match(/^\/api\/p\/waitlist\/(\d+)$/);
    if (del && m === "DELETE") return waitlistDelete(env, Number(del[1]));
    if (path === "/api/p/webhooks" && m === "GET") return webhookList(env);
    if (path === "/api/p/commands" && m === "GET") return commandList(env);
    if (path === "/api/p/commands" && m === "POST") return commandAdd(request, env);
    return notFound();
  }
  if (path.startsWith("/api/")) return notFound();
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      console.error("unhandled", e && e.message);
      return json({ error: "Something went wrong on the site." }, 500);
    }
  },
  async scheduled(_event, env) {
    await ensureSchema(env.DB);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM heartbeats WHERE received_ms < ?").bind(now - 45 * DAY_MS),
      env.DB.prepare("DELETE FROM join_attempts WHERE at_ms < ?").bind(now - 2 * DAY_MS),
      env.DB.prepare("DELETE FROM commands WHERE created_ms < ?").bind(now - 60 * DAY_MS),
    ]);
  },
};

export { coverageDays };
