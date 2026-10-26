// Check the authored tokens, not a separate copy of the palette.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const css = await readFile(new URL("../public/assets/site.css", import.meta.url), "utf8");
const declarations = (block) => Object.fromEntries([...block.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
export function themeTokens(theme) {
  const shared = css.match(/^:root\{([^}]+)\}/m)?.[1];
  const block = css.match(theme === "light" ? /^:root,\[data-theme="light"\]\{([^}]+)\}/m : /^\[data-theme="dark"\]\{([^}]+)\}/m)?.[1];
  assert.ok(shared && block, `Missing ${theme} token definitions`);
  return { ...declarations(shared), ...declarations(block) };
}
export function contrast(a, b) {
  const luminance = (hex) => {
    assert.match(hex, /^#[a-f0-9]{6}$/i);
    const [r, g, blue] = hex.slice(1).match(/../g).map((n) => parseInt(n, 16) / 255)
      .map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return r * .2126 + g * .7152 + blue * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function checkContrast() {
  const systemDark = declarations(css.match(/:root:not\(\[data-theme="light"\]\)\{([^}]+)\}/)?.[1] || "");
  for (const theme of ["light", "dark"]) {
    const tokens = themeTokens(theme);
    for (const name of ["bull", "bear", "bull-wash", "bear-wash", "wire", "wire-faint", "hair", "mono"]) {
      assert.ok(tokens[`--${name}`], `${theme}: missing --${name}`);
    }
    if (theme === "dark") {
      for (const [name, value] of Object.entries(systemDark)) assert.equal(tokens[name], value, `System dark differs: ${name}`);
      assert.ok(Object.hasOwn(systemDark, "--wire"), "System dark token block is missing");
    }
    for (const [kind, names, threshold] of [
      ["graphics", ["bull", "bear", "wire"], 3],
      ["text", ["ink", "soft", "faint", "signal", "bull", "bear", "up", "down", "warn"], 4.5]
    ]) {
      for (const background of ["bg", "panel"]) for (const name of names) {
        const ratio = contrast(tokens[`--${name}`], tokens[`--${background}`]);
        console.log(`${theme} ${kind} --${name} / --${background}: ${ratio.toFixed(2)}:1`);
        assert.ok(ratio >= threshold, `${theme}: --${name} on --${background} is below ${threshold}:1`);
      }
    }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) checkContrast();
