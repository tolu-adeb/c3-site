// Local-only fixture publisher. Production exports are c3.lab's responsibility.
import { publisher } from "../test/lib/publish.mjs";
import { readBundle, validateBundle } from "../test/lib/bundle.mjs";
import { FIXTURE_DIR } from "../test/make-fixtures.mjs";
const [base, keyFile, directory] = process.argv.slice(2).filter((arg) => arg !== "--preview");
if (!base || !keyFile || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Usage: node scripts/seed-r2.mjs <local-base-url> <test-keys.json> [bundle-directory] [--preview]");
const files = await readBundle(directory || FIXTURE_DIR);
await validateBundle(files);
const manifest = JSON.parse(files.get("manifest.json")), api = await publisher(base, keyFile);
for (const file of manifest.files) {
  const result = await api.put(manifest.bundle, file.path, files.get(file.path));
  if (!result.ok) throw new Error(`Upload failed: ${file.path}: ${result.status} ${await result.text()}`);
}
// The staged manifest enables complete previews before committing.
let result = await api.put(manifest.bundle, "manifest.json", files.get("manifest.json"));
if (!result.ok) throw new Error(`Manifest upload failed: ${result.status}`);
if (process.argv.includes("--preview")) console.log(`Staged ${manifest.bundle}; use the private preview with ?staging=${manifest.bundle}.`);
else {
  result = await api.commit(manifest.bundle, manifest);
  if (!result.ok) throw new Error(`Commit failed: ${result.status} ${await result.text()}`);
  console.log(`Committed local fixture bundle ${manifest.bundle}.`);
}
