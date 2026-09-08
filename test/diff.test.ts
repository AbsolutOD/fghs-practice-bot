import { expect, test } from "bun:test";
import { diff, span } from "../src/diff.ts";
import type { Row } from "../src/db.ts";

const row = (date_token: string, raw: string, n = 0): Row => ({
  date_token,
  n,
  first_date: `2026-${date_token.split("/")[0]!.padStart(2, "0")}-${date_token.split("/")[1]!.padStart(2, "0")}`,
  last_date: "2026-12-31",
  type: "practice",
  raw,
});

const at = (a: string, b: string) => {
  const [s, ea, eb] = span(a, b);
  return [a.slice(s, ea), b.slice(s, eb)];
};

test("same key, different raw is one modified", () => {
  const changes = diff([row("9/9", "old")], [row("9/9", "new")]);
  expect(changes).toEqual([
    { kind: "modified", row: row("9/9", "new"), was: row("9/9", "old") },
  ]);
});

test("a changed date token is a removed plus an added", () => {
  const changes = diff([row("9/9", "Practice")], [row("9/10", "Practice")]);
  expect(changes.map(c => [c.kind, c.row.date_token])).toEqual([
    ["removed", "9/9"],
    ["added", "9/10"],
  ]);
});

test("identical input on both sides is empty", () => {
  const rows = [row("9/9", "a"), row("9/9", "b", 1), row("10/2", "c")];
  expect(diff(rows, rows)).toEqual([]);
});

test("changes come back chronological and interleaved", () => {
  const changes = diff(
    [row("10/2", "gone"), row("9/9", "old")],
    [row("9/9", "new"), row("9/29", "fresh")],
  );
  expect(changes.map(c => [c.row.date_token, c.kind])).toEqual([
    ["9/9", "modified"],
    ["9/29", "added"],
    ["10/2", "removed"],
  ]);
});

test("an end-time edit locates the span, not the whole line", () => {
  expect(at("9/9 Practice 3:30-5:00 Range", "9/9 Practice 3:30-4:30 Range"))
    .toEqual(["5:00", "4:30"]);
});

test("a full reword degrades to the whole line", () => {
  expect(at("Galactic Putter Competition", "Bring a friend"))
    .toEqual(["Galactic Putter Competition", "Bring a friend"]);
});
