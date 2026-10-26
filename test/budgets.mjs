// Gzipped first-party page resources. Data JSON from /data is budgeted by the bundle validator.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
const root = fileURLToPath(new URL("../public/", import.meta.url));
async function pages(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await pages(path)); else if (entry.name.endsWith(".html")) output.push(path);
  }
  return output;
}
for (const page of await pages(root)) {
  const visited = new Set();
  async function resource(path) {
    if (visited.has(path)) return 0;
    assert.ok(path.startsWith(root), "Page resource must stay within public/"); visited.add(path);
    const bytes = await readFile(path), content = bytes.toString();
    let total = gzipSync(bytes).byteLength;
    const refs = path.endsWith(".html") ? [...content.matchAll(/(?:src|href)=["']([^"']+)["']/g)].filter((m) => /\.(?:js|css|woff2|svg)$/.test(m[1])).map((m) => m[1])
      : path.endsWith(".css") ? [...content.matchAll(/url\(["']?([^\s"')]+)["']?\)/g)].map((m) => m[1])
        : path.endsWith(".js") ? [...content.matchAll(/(?:from\s*|import\s*|fetch\()["']([^"']+)["']/g)].map((m) => m[1]).filter((ref) => ref.startsWith(".") || ref.startsWith("/assets/")) : [];
    for (const ref of refs) total += await resource(ref.startsWith("/") ? resolve(root, "." + ref) : resolve(dirname(path), ref));
    return total;
  }
  const bytes = await resource(page), label = relative(root, page), budget = label === "index.html" ? 150 * 1024 : 250 * 1024;
  console.log(`${label}: ${(bytes / 1024).toFixed(1)} KiB gzip / ${budget / 1024} KiB`);
  assert.ok(bytes <= budget, `${label} exceeds its page budget`);
}
