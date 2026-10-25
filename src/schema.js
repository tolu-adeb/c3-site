// Tables are created on first use, so a fresh D1 database needs no migration step.
export const SCHEMA = [
  // latest push of each kind from the bot: status (every minute), snapshot (every 5 minutes), track
  `CREATE TABLE IF NOT EXISTS latest (kind TEXT PRIMARY KEY, ts INTEGER NOT NULL, received_ms INTEGER NOT NULL, body TEXT NOT NULL)`,
  // one row per status push: the site's own record of when the bot was alive
  `CREATE TABLE IF NOT EXISTS heartbeats (received_ms INTEGER PRIMARY KEY, ts INTEGER NOT NULL, running INTEGER, stream INTEGER, mode TEXT)`,
  `CREATE TABLE IF NOT EXISTS waitlist (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, note TEXT, created_ms INTEGER NOT NULL, ip_hash TEXT)`,
  `CREATE TABLE IF NOT EXISTS join_attempts (ip_hash TEXT NOT NULL, at_ms INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS join_attempts_ip ON join_attempts (ip_hash, at_ms)`,
  // TradingView front door: every authenticated delivery, duplicates included, as the exact text received
  `CREATE TABLE IF NOT EXISTS webhooks (id INTEGER PRIMARY KEY AUTOINCREMENT, received_ms INTEGER NOT NULL, sym TEXT NOT NULL, t INTEGER NOT NULL, dup INTEGER NOT NULL DEFAULT 0, raw TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS webhooks_key ON webhooks (sym, t)`,
  // commands from the private dashboard; the bot checks each one's HMAC (control code) before running it
  `CREATE TABLE IF NOT EXISTS commands (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, args TEXT NOT NULL, nonce TEXT NOT NULL UNIQUE, ts INTEGER NOT NULL, mac TEXT NOT NULL, created_ms INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', result TEXT, done_ms INTEGER)`,
];
