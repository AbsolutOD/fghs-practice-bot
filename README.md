# fghs-practice-bot

Diffs the FGHS girls golf practice schedule against the last run.

```bash
bun install
bun run index.ts
```

Prints one summary line every run — `27 events, no changes - next: ...` when the
page is unchanged, a `-`/`+`/`x` diff when it is not. Exit code is 0 either way.

`.fghs.db` is a cache, delete it freely: the next run reseeds it from the page and
prints the first-run listing. That is also the whole migration story — change the
schema and delete the file.
