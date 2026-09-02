# Extracting the schedule lines from a Weebly page in Bun

Research for issue #2. Sources: Bun's bundled docs on disk
(`node_modules/bun-types/docs/runtime/html-rewriter.mdx`, Bun 1.4.0) and code run against a
saved copy of `http://www.brandonbritt.com/golf.html`.

## The question

The schedule lives in one `<div class="paragraph">` on a Weebly-generated page. Inside it:

- `<br />` separates logical lines; one line is one dated event.
- Nested `<font>` / `<span>` tags split a single logical line into several sibling text nodes:
  `<font color="#2a2a2a">9/7 </font><font color="#da4444">No Practice: Labor Day</font>` is *one*
  event.
- The `color` attribute carries the event type: `#3a96b8` match, `#2a2a2a` practice, `#da4444`
  no-practice, `#6cb83a` inline annotation. Some lines use `<span style="color:rgb(42, 42, 42)">`
  instead of `<font color>` for the same meaning.

What should we use to turn that into lines of text plus their colors?

## Option 1 — `HTMLRewriter` (built into Bun)

> "HTMLRewriter transforms HTML documents with CSS selectors. It works with `Response`, `string`,
> and `ArrayBuffer` inputs. Bun's implementation is based on Cloudflare's
> [lol-html](https://github.com/cloudflare/lol-html)."
> — `docs/runtime/html-rewriter.mdx`

**`<br />` as a line separator.** It is a streaming rewriter with no DOM, so there is no "line"
handed to you — but there is something better than a DOM walk: handlers fire in document order, so
`.on("div.paragraph br", { element: flush })` interleaves correctly with the text handler for the
surrounding div. `<br>` is void; the docs note `el.canHaveContent` is "false for void elements like
`<br>`", and a probe confirms the element handler fires (`onEndTag` is not usable on it, and is not
needed). "Line" becomes: accumulate text, flush on `<br>`, flush again on the div's end tag.

**Re-joining text split across siblings.** The docs say a text handler gets chunks, not nodes:

> `console.log(text.lastInTextNode); // Whether this is the last chunk`
> — `docs/runtime/html-rewriter.mdx`, Text Operations

Verified two things by running it:

1. A text handler registered on an *ancestor* selector (`div.paragraph`) fires for text inside
   descendants (`<font>`, `<span>`), so one handler catches the whole subtree.
2. Every text node ends with an extra **empty** chunk carrying `lastInTextNode: true`. And with a
   streamed `Response` input, a single text node arrives as several non-empty chunks — feeding
   `9/16 North State Girls High School Challenge` through a `ReadableStream` in 17-byte pieces
   produced `"9/16 North State "`, `"Girls High School"`, `" Challenge"`, `""`.

So the buffering pattern is mandatory, and it is the same buffering that solves the sibling-tag
problem: never treat a chunk as a unit. Append every non-empty chunk to a line buffer, and let
`<br>` — not `lastInTextNode` — decide where a line ends. Given that, `lastInTextNode` is only
useful as a "skip the empty terminator" signal; buffering to the `<br>` subsumes it.

**Colors.** They survive, because element and text handlers share document order. Push the color on
a stack in the `font`/`span` element handler and pop it in `onEndTag` (verified to fire for
`<font>`); every text chunk in between belongs to the color on top of the stack. `getAttribute`
reads `color=` directly, and `style=` for the `rgb(...)` spans.

One gotcha: **HTMLRewriter does not decode entities.** `&nbsp;` reaches the text handler literally
as `"&nbsp;"`. Decoding is on us either way — no option below avoids it.

## Option 2 — a third-party HTML parser

Realistic candidates: **`node-html-parser`** (fast, lightweight, DOM-ish `querySelector`),
**`cheerio`** (jQuery API over `parse5`/`htmlparser2`, the default reflex), and **`linkedom`** (a
fuller DOM implementation). All three build a tree, so `<br>` handling and sibling re-joining are a
`childNodes` walk: iterate children, split on `nodeName === "BR"`, read `textContent`, read
`getAttribute("color")` from the ancestor chain. Colors survive fine. `cheerio` and `linkedom`
decode entities for you; that is the one genuine convenience over HTMLRewriter.

The cost is what it always is: a dependency and its transitive tree in a repo whose `package.json`
currently has two runtime deps, to do a job the runtime already does. `cheerio` in particular pulls
a substantial tree for what is one selector. Nothing here is *hard* with a tree — it is just not
hard without one either.

## Option 3 — plain regex / string handling

Tested honestly rather than dismissed. Grabbing `<div class="paragraph"[^>]*>([\s\S]*?)</div>`,
taking the last match, splitting on `/<br\s*\/?>/i` and stripping tags with `/<[^>]+>/g` **does
recover all 31 dated lines** from this file, including the messy multi-segment ones — because
stripping tags concatenates the sibling text anyway.

But:

- **The colors are gone.** Stripping tags is exactly what destroys the signal the ticket says we
  need. Keeping them means writing a tag-aware scanner — i.e. writing a parser.
- The non-greedy `</div>` match breaks on any nested `<div>`. Confirmed:
  `<div class="paragraph"><div><b>x</b></div>9/7 Practice<br /></div>` captures only up to the
  *inner* `</div>`. This page happens not to nest; Weebly output changing is a normal Tuesday.
- It depends on the schedule being the *last* `div.paragraph` (there are 3).

Regex is only the small option while we throw the colors away. Once colors are in scope it is the
biggest option of the three.

## The experiment

`HTMLRewriter` against the saved page, roughly 25 lines: a color stack fed by
`div.paragraph font, div.paragraph span`, a text handler on `div.paragraph` that appends chunks and
merges adjacent same-color segments, `flush` on `div.paragraph br` and on the div's end tag, then a
`/^\d{1,2}\/\d{1,2}/` filter on the first segment.

Result:

- **35 raw lines seen, 31 dated events extracted** — the expected count.
- **8 of the 31 were split across sibling tags and all came out whole**, with per-segment colors
  intact, e.g.
  - `[#2a2a2a] 9/7` + `[#da4444] No Practice: Labor Day`
  - `[#3a96b8] 9/16 North State Girls High School Challenge 4 players 12:30` + `[#6cb83a] (Best 4 Rankings confirmed)`
  - `[#2a2a2a] 9/15 Practice @ 12 Oaks 3:30-5:00 Possibly on course/` + `[#6cb83a] qualifying for Devils Ridge match` + `[#2a2a2a] )`
- The three `<span style="color:rgb(42, 42, 42)">` lines came through as `rgb(42, 42, 42)`, i.e. the
  same meaning as `#2a2a2a` in a different notation. **Normalize colors before switching on them.**

## Recommendation

**Use `HTMLRewriter`.** It ships with Bun, it is the only option that gives us the lines *and* the
colors without a dependency, and it did the whole job in ~25 lines against the real page.

Tradeoff, stated plainly: streaming means we hand-roll the buffering that a DOM would give us for
free (accumulate chunks, flush on `<br>`), and we decode `&nbsp;` ourselves. That is a handful of
lines. A parser dependency would save those lines and nothing else — it does not clearly beat what
Bun already ships, so it does not earn the install. Regex is off the table the moment colors matter.

Two things to carry into the implementation:

- Normalize `#2a2a2a` and `rgb(42, 42, 42)` to one form before mapping color to event type.
- Filter lines by a leading-date regex rather than by which `div.paragraph` is which — it survives
  Weebly reshuffling the page.
