// Run the existing end-to-end tests against a fresh, local-only Wrangler instance.
// All credentials and D1 state are temporary. No Cloudflare account is needed.
import { generateKeyPairSync, randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { parse } from "jsonc-parser";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "c3-s1-local-"));
const sha = (s) => createHash("sha256").update(s).digest("hex");
let worker, workerExit, workerLog = "", interrupted = false;
async function run(script, args = []) {
  const child = spawn(process.execPath, [join(root, script), ...args], { cwd: root, stdio: "inherit" });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) throw new Error(`${script} failed (${signal || code})`);
}
function interrupt() { interrupted = true; worker?.kill("SIGTERM"); }
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keys = { private_pkcs8_b64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    view_key: randomBytes(32).toString("hex"), webhook_path: randomBytes(16).toString("hex"), webhook_token: randomBytes(32).toString("hex") };
  const keyFile = join(dir, "keys.json");
  await writeFile(keyFile, JSON.stringify(keys), { mode: 0o600 });
  const errors = [];
  const config = parse(await readFile(join(root, "wrangler.jsonc"), "utf8"), errors);
  if (errors.length) throw new Error("Cannot parse wrangler.jsonc");
  delete config.$schema;
  delete config.triggers;
  delete config.observability;
  config.name = "c3-site-s1-test";
  config.main = resolve(root, config.main);
  config.assets.directory = resolve(root, config.assets.directory);
  config.d1_databases = config.d1_databases.map((db) => ({ binding: db.binding, database_name: "c3-site-s1-test",
    database_id: "00000000-0000-0000-0000-000000000001", remote: false }));
  const vars = { BOT_PUBLIC_KEY: publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64"),
    VIEW_KEY_SHA256: sha(keys.view_key), WEBHOOK_PATH_SHA256: sha(keys.webhook_path), WEBHOOK_TOKEN_SHA256: sha(keys.webhook_token),
    WEBHOOK_ENABLED: "true", TRACK_RECORD_PUBLIC: "true" };
  // Wrangler reads .dev.vars beside this isolated config, never the checkout's file.
  await writeFile(join(dir, ".dev.vars"), Object.entries(vars).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("\n") + "\n", { mode: 0o600 });
  const configFile = join(dir, "wrangler.json");
  await writeFile(configFile, JSON.stringify(config));
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  const base = `http://127.0.0.1:${port}`;
  worker = spawn(process.execPath, [join(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--local", "--config", configFile,
    "--persist-to", join(dir, "state"), "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0"], {
    cwd: dir, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: join(dir, "wrangler.log"),
      CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "" }
  });
  workerExit = once(worker, "exit");
  for (const stream of [worker.stdout, worker.stderr]) stream.on("data", (chunk) => { workerLog = (workerLog + chunk).slice(-30000); });
  let ready = false;
  const deadline = Date.now() + 45000;
  while (!ready && Date.now() < deadline && !interrupted && worker.exitCode === null) {
    try { ready = (await fetch(base + "/api/health", { signal: AbortSignal.timeout(1000) })).ok; } catch { /* starting */ }
    if (!ready) await delay(200);
  }
  if (!ready) throw new Error("Local Wrangler did not become healthy within 45 seconds");
  console.log(`Local-only Worker ready at ${base}.`);
  if (!process.argv.includes("--ui-only")) {
    await run("test/smoke.mjs", [base, keyFile]);
    await run("test/fuzz.mjs", [base, keyFile]);
  }
  if (process.argv.includes("--ui") || process.argv.includes("--ui-only")) {
    await run("test/charts.mjs", [base]);
    await run("test/ui.mjs", [base]);
  }
} catch (error) {
  console.error(workerLog);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill("SIGTERM");
    const forced = setTimeout(() => worker.kill("SIGKILL"), 5000);
    await workerExit;
    clearTimeout(forced);
  }
  await rm(dir, { recursive: true, force: true });
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
