import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
export async function publisher(base, keyFile) {
  const keys = JSON.parse(await readFile(keyFile));
  const key = createPrivateKey({ key: Buffer.from(keys.private_pkcs8_b64, "base64"), format: "der", type: "pkcs8" });
  let sequence = 0;
  function headers(method, path, body, ts = Math.floor(Date.now() / 1000)) {
    const msg = `${method}\n${path}\n${ts}\n${createHash("sha256").update(body).digest("hex")}`;
    return { "x-c3-timestamp": String(ts), "x-c3-signature": sign(null, Buffer.from(msg), key).toString("base64"), "content-type": "application/json" };
  }
  const send = (method, path, body = "", opts = {}) => {
    path += (path.includes("?") ? "&" : "?") + "request=" + sequence++;
    return fetch(base + path, { method, headers: { ...headers(method, path, body, opts.ts), ...opts.headers }, body: method === "GET" || method === "HEAD" ? undefined : body });
  };
  const view = { authorization: "Bearer " + keys.view_key };
  const put = (bundle, path, bytes) => send("PUT", `/api/publish/put?bundle=${bundle}&path=${encodeURIComponent(path)}`, bytes);
  const commit = (bundle, manifest) => send("POST", `/api/publish/commit?bundle=${bundle}`, JSON.stringify(manifest));
  const read = (path, staging) => fetch(base + "/api/p/data/" + path + (staging ? "?staging=" + staging : ""), { headers: view });
  return { keys, headers, send, view, put, commit, read };
}
