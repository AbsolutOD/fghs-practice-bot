import { expect, test } from "bun:test";
import { render } from "../src/print.ts";
import type { Row } from "../src/db.ts";

const row = (date_token: string, raw: string, n = 0): Row => ({
  date_token,
  n,
  first_date: `2026-${date_token.split("/")[0]!.padStart(2, "0")}-${date_token.split("/")[1]!.padStart(2, "0")}`,
  last_date: "2026-12-31",
  type: "practice",
  raw,
});

// chalk is level 0 off a TTY, but bun test may hand it one — compare plain text.
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const lines = (s: string) => plain(s).split("\n");

const page = [row("9/7", "9/7 No Practice: Labor Day"), row("9/9", "9/9 Practice @ 12 Oaks")];

test("no changes is exactly one summary line", () => {
  expect(lines(render(2, page, []))).toEqual([
    "2 events, no changes - next: 9/7 No Practice: Labor Day",
  ]);
});

test("first run lists every event unmarked", () => {
  expect(lines(render(0, page, []))).toEqual([
    "First run - now tracking 2 events",
    "  9/7 No Practice: Labor Day",
    "  9/9 Practice @ 12 Oaks",
  ]);
});

test("a modified pair is one change printed as - then +", () => {
  const was = row("9/9", "9/9 Practice @ 12 Oaks 3:30-5:00");
  const now = row("9/9", "9/9 Practice @ 12 Oaks 3:30-4:30");
  expect(lines(render(2, [page[0]!, now], [{ kind: "modified", row: now, was }]))).toEqual([
    "2 events, 1 changed",
    "- 9/9 Practice @ 12 Oaks 3:30-5:00",
    "+ 9/9 Practice @ 12 Oaks 3:30-4:30",
  ]);
});

test("added and removed get their own markers", () => {
  const gone = row("9/29", "9/29 No Practice");
  const fresh = row("10/2", "10/2 Team photos @ 12 Oaks 3:30");
  const changes = [
    { kind: "removed", row: gone },
    { kind: "added", row: fresh },
  ] as const;
  expect(lines(render(2, page, [...changes]))).toEqual([
    "2 events, 2 changed",
    "x 9/29 No Practice",
    "+ 10/2 Team photos @ 12 Oaks 3:30",
  ]);
});
