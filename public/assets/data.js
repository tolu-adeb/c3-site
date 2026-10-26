// Public data reads and private previews share the same file contract.
const params = new URLSearchParams(location.search);
export const staging = params.get("staging");
export const preview = params.get("preview") === "current" || params.has("staging");
export const slug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100;
export function viewKey() {
  let key = "";
  try { key = localStorage.getItem("c3.view") || ""; } catch { /* storage unavailable */ }
  if (!key) throw new Error("Open your private dashboard link in this browser before previewing data.");
  return key;
}
export function dataLink(path, values = {}) {
  const url = new URL(path, location.origin);
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, value);
  if (params.has("staging")) url.searchParams.set("staging", staging);
  else if (preview) url.searchParams.set("preview", "current");
  return url.pathname + url.search + url.hash;
}
export async function readJSON(path, options = {}) {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,200}\.json$/.test(path) || path.includes("..") || path.includes("//")) throw new Error("Invalid data path.");
  const headers = {};
  if (preview) {
    if (params.has("staging") && !slug(staging)) throw new Error("Invalid staging bundle.");
    headers.authorization = "Bearer " + viewKey();
  }
  const query = new URLSearchParams();
  if (staging) query.set("staging", staging);
  if (options.bundle) query.set("bundle", options.bundle);
  const url = (preview ? "/api/p/data/" : "/data/") + path + (query.size ? "?" + query : "");
  const response = await fetch(url, { headers, signal: options.signal, cache: preview ? "no-store" : "default" });
  if (response.status === 404) {
    const error = new Error(preview ? "This preview is incomplete or is no longer available." : "Results not published yet.");
    error.status = 404; throw error;
  }
  if (!response.ok) throw new Error(response.status === 401 ? "This browser’s private link is no longer valid." : "Data could not be loaded. Try again later.");
  if (options.entry) {
    const bytes = await response.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== options.entry.bytes || hash !== options.entry.sha256) throw new Error("The published bundle changed while loading. Reload this page to use one consistent version.");
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  return response.json();
}
export async function loadBundle() {
  const manifest = await readJSON("manifest.json");
  return { manifest, read(path) {
    const entry = manifest.files.find((file) => file.path === path);
    if (!entry) throw new Error("This bundle does not include " + path + ".");
    return readJSON(path, { entry, bundle: manifest.bundle });
  } };
}
if (preview) {
  document.querySelectorAll(".research-nav a,.research-foot a").forEach((link) => { link.href = dataLink(link.getAttribute("href")); });
}
