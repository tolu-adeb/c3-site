// Optional commit-time helper. Generated plain HTML is committed; deploys have no build step.
import { readFile, writeFile, mkdir } from "node:fs/promises";
const root = new URL("../public/", import.meta.url);
const source = await readFile(new URL("backtests/index.html", root), "utf8");
const chrome = source.slice(source.indexOf("<header"), source.indexOf("<main"));
const footer = source.slice(source.indexOf("<footer"), source.indexOf('<script src="/assets/chrome.js"'));
const escape = (text) => String(text).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
export async function page({ path, title, label, headline, intro, body, script, current }) {
  const nav = `<nav class="research-nav" aria-label="Research">${[["engine", "Engine"], ["strategies", "Strategies"], ["backtests", "Backtests"], ["replay", "Replay"], ["lab", "Lab"], ["methodology", "Methodology"]].map(([id, text]) => `<a href="/${id}/"${id === current ? ' aria-current="page"' : ""}>${text}</a>`).join("")}</nav>`;
  await mkdir(new URL(path + "/", root), { recursive: true });
  await writeFile(new URL(path + "/index.html", root), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | c3.lab</title><meta name="description" content="${escape(intro)}"><meta name="color-scheme" content="light dark"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/fonts/archivo-var.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/research.css"><script src="/assets/theme.js"></script></head><body><a class="skip" href="#main">Skip to content</a>${chrome}<main class="wrap research" id="main">${nav}<span class="tag">${escape(label)}</span><h1 id="page-title">${headline}</h1><p class="intro">${escape(intro)}</p>${body}</main>${footer}<script src="/assets/chrome.js"></script>${script ? `<script type="module" src="/assets/${script}"></script>` : ""}</body></html>\n`);
}
