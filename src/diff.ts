import type { Row } from "./db.ts";

export type Change =
  | { kind: "added"; row: Row }
  | { kind: "removed"; row: Row }
  | { kind: "modified"; row: Row; was: Row };

const key = (r: Row) => `${r.date_token}#${r.n}`;

/**
 * Join on `(date_token, n)` (#4). A same-key `raw` change is one `modified`, not a
 * remove plus an add; a changed date token is a new key, so it is exactly the
 * remove plus add it looks like (#5). Unchanged rows are dropped — this is a diff.
 *
 * `type` is never consulted. Both sides are already pruned of past events (#9), so
 * `removed` has one meaning: the coach deleted a still-future line.
 *
 * Sorted chronologically and interleaved, which is how #13 prints it.
 */
export function diff(stored: Row[], page: Row[]): Change[] {
  const before = new Map(stored.map(r => [key(r), r]));
  const changes: Change[] = [];
  for (const row of page) {
    const was = before.get(key(row));
    before.delete(key(row));
    if (!was) changes.push({ kind: "added", row });
    else if (was.raw !== row.raw) changes.push({ kind: "modified", row, was });
  }
  for (const row of before.values()) changes.push({ kind: "removed", row });
  return changes.sort((a, b) => a.row.first_date.localeCompare(b.row.first_date));
}

/**
 * Where two `raw` lines differ: common-prefix / common-suffix trim, then each end
 * pushed out to a word boundary so `5:00`/`4:30` reads whole instead of `5:0`/`4:3`.
 * Returns `[start, endA, endB]` — the span is `a.slice(start, endA)` / `b.slice(start, endB)`.
 *
 * A display affordance, not a field diff: on a full reword nothing is common and it
 * degrades to the whole line, which #13 prints as the plain `-`/`+` pair. No chalk
 * here — formatting is the CLI's job.
 */
export function span(a: string, b: string): [number, number, number] {
  const word = /\w/;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let tail = 0;
  while (
    tail < a.length - start &&
    tail < b.length - start &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail++;
  let endA = a.length - tail;
  let endB = b.length - tail;
  while (start > 0 && word.test(a[start - 1]!)) start--;
  while (endA < a.length && word.test(a[endA]!)) endA++;
  while (endB < b.length && word.test(b[endB]!)) endB++;
  return [start, endA, endB];
}
