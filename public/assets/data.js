// Public data reads and private previews share the same file contract.
const params = new URLSearchParams(location.search);
export const staging = params.get("staging");
export const preview = params.get("preview") === "current" || params.has("staging");
export const slug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100;
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
    let key = "";
    try { key = localStorage.getItem("c3.view") || ""; } catch { /* storage unavailable */ }
    if (!key) throw new Error("Open your private dashboard link in this browser before previewing data.");
    headers.authorization = "Bearer " + key;
  }
  const url = (preview ? "/api/p/data/" : "/data/") + path + (staging ? "?staging=" + encodeURIComponent(staging) : "");
  const response = await fetch(url, { headers, signal: options.signal, cache: preview ? "no-store" : "default" });
  if (response.status === 404) {
    const error = new Error(preview ? "This preview is incomplete or is no longer available." : "Results not published yet.");
    error.status = 404; throw error;
  }
  if (!response.ok) throw new Error(response.status === 401 ? "This browser’s private link is no longer valid." : "Data could not be loaded. Try again later.");
  return response.json();
}
