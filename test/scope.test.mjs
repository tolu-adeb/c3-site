import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { buildFixtureBundle } from "./make-fixtures.mjs";
import { validateBundle } from "./lib/bundle.mjs";
import { createHash } from "node:crypto";
import { validManifest } from "../src/publish.js";
test("public pages have no Strategy Lab destination or history section", async () => {
  async function walk(url) {
    for (const entry of await readdir(url, { withFileTypes: true })) {
      const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
      if (entry.isDirectory()) await walk(target);
      else if (entry.name.endsWith(".html")) {
        const html = await readFile(target, "utf8");
        assert.doesNotMatch(html, /href="\/lab\//);
        assert.doesNotMatch(html, /id="strategy-lab"/);
      }
    }
  }
  await walk(new URL("../public/", import.meta.url));
});
test("exporters may omit legacy Strategy Lab files and references", async () => {
  const files = buildFixtureBundle(); files.delete("lab/trials.json"); files.delete("lab/summary.json");
  const strategies = JSON.parse(files.get("strategies.json")); strategies.forEach((s) => { delete s.lab_trials; });
  files.set("strategies.json", Buffer.from(JSON.stringify(strategies)));
  const manifest = JSON.parse(files.get("manifest.json"));
  manifest.files = [...files].filter(([name]) => name !== "manifest.json").map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }));
  files.set("manifest.json", Buffer.from(JSON.stringify(manifest)));
  assert.equal(validManifest(manifest, manifest.bundle), true);
  assert.equal((await validateBundle(files)).trials, 0);
});
