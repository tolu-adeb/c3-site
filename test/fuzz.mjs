// 300 generated cases for the research-papers routes (seeded, so every run checks the same ones).
//   200  link normalisation (cleanRef): what the site accepts, the bot's fetcher must accept too (checked in Python)
//   100  signed requests against `wrangler dev`: only an exact, fresh signature gets through
// Usage: node test/fuzz.mjs <base-url> <keys.json> [path to mnq-bot for the Python cross-check]
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cleanRef } from "../src/index.js";

const base = process.argv[2] || "http://127.0.0.1:8787";
const keys = JSON.parse(readFileSync(process.argv[3], "utf8"));
const botDir = process.argv[4];
const priv = createPrivateKey({ key: Buffer.from(keys.private_pkcs8_b64, "base64"), format: "der", type: "pkcs8" });
let pass = 0, fail = 0;
const ok = (c, label) => { if (c) pass++; else { fail++; console.log("FAIL", label); } };

let seed = 20261025;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join("");

// ---------------- 200 cleanRef cases
const cases = [];
for (let i = 0; i < 200; i++) {
  const k = ["arxiv", "doi", "url", "title"][i % 4];
  let raw, expect;
  const bad = rnd() < 0.4;
  if (k === "arxiv") {
    const id = pick([`${digits(4)}.${digits(pick([4, 5]))}`, `hep-th/${digits(7)}`, `math.AG/${digits(7)}`]) + (rnd() < 0.3 ? `v${1 + Math.floor(rnd() * 9)}` : "");
    raw = bad ? pick([`${digits(3)}.${digits(4)}`, "arxiv", `${id} extra`, `https://evil.example/${id}`, "", "12345.67890"])
      : pick([id, `arXiv:${id}`, `https://arxiv.org/abs/${id}`, `https://arxiv.org/pdf/${id}.pdf`, `  ${id} `]);
    expect = bad ? null : "ok";
  } else if (k === "doi") {
    const d = `10.${digits(4 + Math.floor(rnd() * 3))}/${pick(["ssrn.", "j.jfineco.", "rfs/hh", "abc-"])}${digits(5)}`;
    raw = bad ? pick(["11.1234/x", "10.12/x", "doi", `10.1234/`, `10.1234/with space`, ""]) : pick([d, `doi:${d}`, `https://doi.org/${d}`, `http://dx.doi.org/${d}`]);
    expect = bad ? null : "ok";
  } else if (k === "url") {
    raw = bad ? pick(["ftp://x.com/a.pdf", "javascript:alert(1)", "https://a b.com", "www.example.com/a.pdf", "https://x", "https://" + "a".repeat(1001)])
      : pick([`https://papers.ssrn.com/sol3/papers.cfm?abstract_id=${digits(7)}`, `https://example.org/files/p${digits(3)}.pdf`, `http://journal.test/a/${digits(4)}`]);
    expect = bad ? null : "ok";
  } else {
    raw = bad ? pick(["", "short", "x".repeat(301)]) : pick(["Opening Range Breakouts and Intraday Momentum", "  The Profitability of Day Trading  ", "Order Flow Imbalance " + digits(3)]);
    expect = bad ? null : "ok";
  }
  const got = cleanRef(k, raw);
  ok(expect === null ? got === null : typeof got === "string" && got.length > 0, `cleanRef ${k} ${JSON.stringify(raw).slice(0, 60)} -> ${got}`);
  if (got) cases.push({ kind: k, ref: got });
}
if (botDir) {   // every ref the site accepts must pass the bot's own parser for that kind
  const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(botDir)})
from mnq.papers.fetch import ARXIV_ID, DOI
bad = []
for c in json.load(sys.stdin):
    if c["kind"] == "arxiv" and not ARXIV_ID.match(c["ref"]): bad.append(c)
    if c["kind"] == "doi" and not DOI.match(c["ref"]): bad.append(c)
    if c["kind"] == "url" and not c["ref"].lower().startswith(("http://", "https://")): bad.append(c)
print(json.dumps(bad))`;
  const bad = JSON.parse(execFileSync("python3", ["-c", py], { input: JSON.stringify(cases) }).toString());
  ok(bad.length === 0, `bot rejects refs the site accepted: ${JSON.stringify(bad).slice(0, 300)}`);
  if (!bad.length) console.log(`cross-check: the bot accepts all ${cases.length} refs the site accepted`);
}

// ---------------- 100 signed-request cases against the running Worker
function headers(method, path, body, ts) {
  const msg = `${method}\n${path}\n${ts}\n${createHash("sha256").update(body || Buffer.alloc(0)).digest("hex")}`;
  return { "x-c3-timestamp": String(ts), "x-c3-signature": sign(null, Buffer.from(msg), priv).toString("base64"), "content-type": "application/json" };
}
const now = () => Math.floor(Date.now() / 1000);
let lastPapersTs = 0;
for (let i = 0; i < 100; i++) {
  const target = pick(["pull", "blob", "ingest"]);
  const mutation = pick(["none", "none", "path", "ts-old", "ts-future", "body", "method", "sig", "unsigned"]);
  let path = target === "pull" ? `/api/papers/pull?id=${1 + (i % 5)}` : target === "blob" ? `/api/papers/blob/${1 + (i % 5)}` : "/api/ingest";
  let method = target === "ingest" ? "POST" : "GET";
  let ts = now();
  if (target === "ingest") { ts = Math.max(ts, lastPapersTs + 1); }
  const body = target === "ingest" ? Buffer.from(JSON.stringify({ kind: "papers", ts, data: { items: [{ id: 999000 + i, status: "done" }] } })) : null;
  let h = headers(method, path, body, mutation === "ts-old" ? ts - 400 : mutation === "ts-future" ? ts + 400 : ts);
  if (mutation === "ts-old") h["x-c3-timestamp"] = String(ts - 400);
  if (mutation === "ts-future") h["x-c3-timestamp"] = String(ts + 400);
  if (mutation === "path") path = path.replace(/\d+$/, (d) => String(Number(d) + 1)).replace("/api/ingest", "/api/ingest?x=1");
  if (mutation === "sig") h["x-c3-signature"] = Buffer.from(h["x-c3-signature"], "base64").map((b, j) => (j === 3 ? b ^ 1 : b)).toString("base64");
  if (mutation === "unsigned") h = { "content-type": "application/json" };
  let sendBody = body;
  if (mutation === "body" && body) sendBody = Buffer.from(body.toString().replace("done", "fail"));
  if (mutation === "method") method = method === "GET" ? "POST" : "PUT";
  const r = await fetch(base + path, { method, headers: h, body: method === "GET" ? undefined : sendBody || "" });
  let expectOk = mutation === "none" || (mutation === "body" && !body);
  if (target === "ingest" && expectOk) lastPapersTs = ts;
  const accepted = r.status === 200 || r.status === 410;   // 410: a blob that isn't there, after a valid signature
  if (expectOk) ok(accepted, `${target} exact signature -> ${r.status}`);
  else ok(!accepted && [400, 401, 404, 405].includes(r.status), `${target} ${mutation} -> ${r.status} (should be refused)`);
}

console.log(`\nfuzz: ${pass} passed, ${fail} failed (${pass + fail} checks)`);
process.exit(fail ? 1 : 0);
