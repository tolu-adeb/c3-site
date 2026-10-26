// Validate a fixture or downloaded/exported bundle without changing it.
// Usage: node test/validate.mjs [bundle-directory]
import { readBundle, validateBundle } from "./lib/bundle.mjs";
import { FIXTURE_DIR } from "./make-fixtures.mjs";

try {
  if (process.argv.length > 3) throw new Error("Usage: node test/validate.mjs [bundle-directory]");
  const result = await validateBundle(await readBundle(process.argv[2] || FIXTURE_DIR));
  console.log(`Bundle valid: ${result.files} files, ${result.runs} runs, ${result.sessions} sessions, ${result.trades} trades, ${result.trials} trials, ${result.parity} parity days.`);
} catch (error) {
  console.error(`Bundle invalid: ${error.message}`);
  process.exitCode = 1;
}
