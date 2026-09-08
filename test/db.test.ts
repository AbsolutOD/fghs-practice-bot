import { expect, test } from "bun:test";
import { norm, open, prune, resolve, toRows, type Row } from "../src/db.ts";
import type { ParsedEvent } from "../src/parse.ts";

const at = (y: number, mo: number, d: number) => new Date(y, mo - 1, d);
const event = (dates: string[], raw = dates.join("+")): ParsedEvent => ({
  dates,
  dateKind: dates.length === 1 ? "single" : "range",
  raw,
  type: "practice",
});
const insert = (db: ReturnType<typeof open>, r: Row) =>
  db.run("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)", [
    r.date_token, r.n, r.first_date, r.last_date, r.type, r.raw,
  ]);

test.each([
  ["9/9", at(2026, 9, 4), "2026-09-09"],
  ["8/17", at(2026, 10, 30), "2026-08-17"],
  ["10/27", at(2026, 7, 15), "2026-10-27"],
  ["1/15", at(2026, 10, 30), "2027-01-15"],
  ["9/9", at(2027, 1, 20), "2026-09-09"],
  ["1/15", at(2027, 1, 20), "2027-01-15"],
  ["12/31", at(2026, 12, 31), "2026-12-31"],
  ["1/1", at(2026, 12, 31), "2027-01-01"],
])("%s run on %s resolves to %s", (tok, now, expected) => {
  expect(resolve(tok as string, now as Date)).toBe(expected);
});

test("a cosmetic zero-pad is the same token", () => {
  expect(norm("09/09")).toBe(norm("9/9"));
});

test("a range crossing New Year resolves both ends", () => {
  const [row] = toRows([event(["12/30", "1/2"])], at(2026, 12, 1));
  expect(row).toMatchObject({ first_date: "2026-12-30", last_date: "2027-01-02" });
});

test("two events sharing a token get n 0 and 1 in page order", () => {
  const rows = toRows([event(["9/9"], "first"), event(["9/9"], "second")], at(2026, 9, 1));
  expect(rows.map(r => [r.n, r.raw])).toEqual([[0, "first"], [1, "second"]]);
});

test("an event dated today survives both sides", () => {
  const now = at(2026, 9, 2);
  const db = open(":memory:");
  const [row] = toRows([event(["9/2"])], now);
  expect(row).toBeDefined();
  insert(db, row!);
  prune(db, now);
  expect(db.query("SELECT * FROM events").all()).toHaveLength(1);
});

test("a past event is pruned from the table and not re-inserted from the page", () => {
  const now = at(2026, 9, 3);
  const db = open(":memory:");
  insert(db, {
    date_token: "9/2", n: 0,
    first_date: "2026-09-02", last_date: "2026-09-02",
    type: "practice", raw: "9/2 Practice",
  });
  prune(db, now);
  expect(db.query("SELECT * FROM events").all()).toHaveLength(0);
  expect(toRows([event(["9/2"])], now)).toHaveLength(0);
});

test("dropping a finished event does not renumber a live one sharing its token", () => {
  const rows = toRows(
    [event(["9/2"], "finished single"), event(["9/2", "9/4"], "live range")],
    at(2026, 9, 3),
  );
  expect(rows).toMatchObject([{ date_token: "9/2", n: 1, raw: "live range" }]);
});
