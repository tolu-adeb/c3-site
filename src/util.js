export function b64decode(s) {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function sha256hex(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

// New York calendar date, minutes after midnight and weekday for an epoch-ms instant.
export function etParts(ms) {
  const p = {};
  for (const x of ET.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: p.weekday };
}
