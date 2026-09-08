#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "./package.json" with { type: "json" };
import { parse } from "./src/parse.ts";
import { diff } from "./src/diff.ts";
import { open, swap, toRows } from "./src/db.ts";
import { render } from "./src/print.ts";

// Hardcoded until a second school's page exists — a --url flag and an FGHS_DB
// env var are both YAGNI while there is exactly one page (#13).
const PAGE_URL = "http://www.brandonbritt.com/golf.html";

new Command()
  .name("fghs")
  .description("Diff the FGHS golf practice schedule against the last run")
  .version(pkg.version)
  .parse();

/** `fetch` resolves on 4xx, so a 404 body would otherwise reach the parser. */
async function fetchPage(): Promise<string> {
  const res = await fetch(PAGE_URL);
  if (!res.ok) throw new Error(`${PAGE_URL} -> ${res.status} ${res.statusText}`);
  return res.text();
}

// Only the fetch is guarded, and it runs before the write, so #9's "a failed run
// is a no-op" holds. Nothing after the write is caught: a throw there must not be
// reported as a fetch failure, or a committed change would go unprinted.
const html = await fetchPage().catch(e => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

const page = toRows(parse(html));
const stored = swap(open(), page);
console.log(render(stored.length, page, diff(stored, page)));
