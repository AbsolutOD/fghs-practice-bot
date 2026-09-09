import chalk from "chalk";
import type { Row } from "./db.ts";
import { span, type Change } from "./diff.ts";

/** Bold the `[start,end)` slice — the part that actually changed (#12). */
const mark = (s: string, start: number, end: number) =>
  s.slice(0, start) + chalk.bold(s.slice(start, end)) + s.slice(end);

/**
 * Colour encodes the change category, never the event type: the page's own red
 * means *no practice*, so type-colouring would collide with removed (#13).
 * `+` does double duty for added and the new half of a pair — piped, chalk drops
 * to level 0 and the preceding `-` disambiguates, exactly like `diff`.
 */
const format = (c: Change): string[] => {
  if (c.kind === "added") return [chalk.green(`+ ${c.row.raw}`)];
  if (c.kind === "removed") return [chalk.red(`x ${c.row.raw}`)];
  const [start, endWas, endNow] = span(c.was.raw, c.row.raw);
  return [
    chalk.yellow(`- ${mark(c.was.raw, start, endWas)}`),
    chalk.yellow(`+ ${mark(c.row.raw, start, endNow)}`),
  ];
};

const byDate = (rows: Row[]) =>
  [...rows].sort((a, b) => a.first_date.localeCompare(b.first_date));

/**
 * Always a summary line — a healthy quiet run has to look different from a broken
 * one that parsed nothing. The `storedCount === 0` branch earns itself because #9
 * empties the DB by June, so every season would otherwise open on a false alarm
 * reading "28 events, 28 added".
 *
 * ponytail: the first-run listing prints every row — no truncation, no pager. A
 * season is under 30 events; add a pager when one runs to hundreds.
 */
export function render(storedCount: number, page: Row[], changes: Change[]): string {
  if (storedCount === 0)
    return [
      `First run - now tracking ${page.length} events`,
      ...byDate(page).map(r => `  ${r.raw}`),
    ].join("\n");
  const events = `${page.length} events`;
  if (changes.length === 0) {
    const next = byDate(page)[0];
    return `${events}, no changes${next ? ` - next: ${next.raw}` : ""}`;
  }
  return [`${events}, ${changes.length} changed`, ...changes.flatMap(format)].join("\n");
}
