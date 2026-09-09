import { Database } from "bun:sqlite";
import type { ParsedEvent } from "./parse.ts";

export type Row = {
  date_token: string;
  n: number;
  first_date: string;
  last_date: string;
  type: ParsedEvent["type"];
  raw: string;
};

/**
 * `IF NOT EXISTS` on every open — 29 rows, one writer, no migration step (#7).
 * Path is a defaulted argument, not an env var, so tests pass `:memory:`.
 */
export function open(path = `${process.cwd()}/.fghs.db`): Database {
  const db = new Database(path);
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      date_token TEXT    NOT NULL,
      n          INTEGER NOT NULL,
      first_date TEXT    NOT NULL,
      last_date  TEXT    NOT NULL,
      type       TEXT    NOT NULL,
      raw        TEXT    NOT NULL,
      PRIMARY KEY (date_token, n)
    ) STRICT;
  `);
  return db;
}

/** Aug-Dec belongs to the season that opened this calendar year; Jan-Jun to the one before. */
const seasonYear = (now: Date) =>
  now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;

const iso = (y: number, mo: number, d: number) =>
  `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * "M/D" -> ISO, anchored per-month against the season (#4). A range crossing New
 * Year needs no special case because each token is resolved on its own month.
 */
export const resolve = (tok: string, now: Date) => {
  const [mo, d] = tok.split("/").map(Number) as [number, number];
  const s = seasonYear(now);
  return iso(mo >= 7 ? s : s + 1, mo, d);
};

/** `09/09` -> `9/9`, so a cosmetic edit by the coach is not a phantom add (#5). */
export const norm = (tok: string) => tok.split("/").map(Number).join("/");

/** Local, not UTC — "today" is the coach's day. */
const todayISO = (now: Date) => iso(now.getFullYear(), now.getMonth() + 1, now.getDate());

/**
 * Page order is a property of the fetch and unrecoverable on read, so `n` is
 * stored. It is counted before the past filter, so dropping a finished 9/2 does
 * not renumber a 9/2-9/3 range still running.
 */
export function toRows(events: ParsedEvent[], now = new Date()): Row[] {
  const today = todayISO(now);
  const seen = new Map<string, number>();
  const rows: Row[] = [];
  for (const e of events) {
    const date_token = norm(e.dates[0]!);
    const n = seen.get(date_token) ?? 0;
    seen.set(date_token, n + 1);
    const last_date = resolve(e.dates.at(-1)!, now);
    if (last_date < today) continue; // today is live, not past (#9)
    rows.push({
      date_token,
      n,
      first_date: resolve(e.dates[0]!, now),
      last_date,
      type: e.type,
      raw: e.raw,
    });
  }
  return rows;
}

/**
 * The stored half of the same rule `toRows` applies to the page. The symmetry is
 * load-bearing: pruning a 9/2 row still listed on the page would report it
 * `added` on every run forever (#9).
 */
export const prune = (db: Database, now = new Date()) =>
  db.run("DELETE FROM events WHERE last_date < ?", [todayISO(now)]);

/**
 * Prune, read the previous snapshot, install the new one — one transaction, so a
 * run that dies halfway is a no-op and the next run diffs against the same rows
 * it would have (#9). Stored rows are read *after* the prune, so a finished event
 * is never reported removed. Lives here, not in the CLI, because it is the only
 * other place that knows the column list.
 */
export const swap = (db: Database, page: Row[]): Row[] =>
  db.transaction(() => {
    prune(db);
    const stored = db.query("SELECT * FROM events").all() as Row[];
    db.run("DELETE FROM events");
    const insert = db.prepare(
      "INSERT INTO events (date_token, n, first_date, last_date, type, raw) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const r of page)
      insert.run(r.date_token, r.n, r.first_date, r.last_date, r.type, r.raw);
    return stored;
  })();
