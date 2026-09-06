export type ParsedEvent = {
  /** Raw "M/D" tokens as written: ["9/9"] | ["10/19","10/20"] | ["10/26","10/27"] */
  dates: string[];
  dateKind: "single" | "either" | "range";
  /** The whole logical line: tags joined, entities decoded, whitespace collapsed. */
  raw: string;
  type: "practice" | "no-practice" | "match" | "meeting" | "unknown";
};

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** HTMLRewriter hands text over undecoded — `&nbsp;` arrives literal. */
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] !== "#") return NAMED[ref.toLowerCase()] ?? whole;
    const cp =
      ref[1] === "x" || ref[1] === "X"
        ? parseInt(ref.slice(2), 16)
        : parseInt(ref.slice(1), 10);
    return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
  });

// \s already covers the decoded &nbsp; (U+00A0); the &#8203; zero-width space it does not.
const collapse = (s: string) => s.replace(/\u200B/g, "").replace(/\s+/g, " ").trim();

const DATE_TOKEN = /\d{1,2}\/\d{1,2}/g;
/** The leading date expression: one M/D token, plus any joined to it. */
const LEADING_DATES = /^\d{1,2}\/\d{1,2}(?:\s*(?:[-\u2013\u2014,]|or)\s*\d{1,2}\/\d{1,2})*/i;

const typeOf = (raw: string): ParsedEvent["type"] =>
  /no practice/i.test(raw) ? "no-practice"           // first: it contains "practice"
  : /\bmeeting\b/i.test(raw) ? "meeting"
  : /\bpractice\b/i.test(raw) ? "practice"
  // Nine of ten match lines never contain the word "match", hence the alternates.
  // ponytail: a fixed vocabulary, not an exhaustive one — a novel event name falls
  // through to "unknown" rather than being classified. It is still tracked, because
  // `raw` carries it; widen the alternation when a real line lands in "unknown".
  : /\bmatch\b|invitational|championship|regionals|challenge/i.test(raw) ? "match"
  : "unknown";

/** A line is an event iff it starts with an M/D token. Everything else is dropped. */
const toEvent = (raw: string): ParsedEvent | null => {
  const expr = LEADING_DATES.exec(raw)?.[0];
  if (!expr) return null;
  const tokens = expr.match(DATE_TOKEN)!;
  // ponytail: two-date ceiling — `10/19, 10/22 or 10/25` keeps first and last and
  // loses the middle. No such line exists on the page today; carrying the full list
  // means widening the two date columns in the schema (#7) too.
  const dates = tokens.length > 2 ? [tokens[0]!, tokens.at(-1)!] : tokens;
  return {
    dates,
    dateKind: tokens.length === 1 ? "single" : /[-–—]/.test(expr) ? "range" : "either",
    raw,
    type: typeOf(raw),
  };
};

/**
 * Only `div.paragraph` blocks are read, which is what keeps the upper `<h2>`
 * "Match Schedule" block out (#1: it lists the same matches and is deliberately
 * not ingested). Scope is then the leading-date filter in `toEvent`, not "the
 * third paragraph" — there are three `div.paragraph` on the page and #2 chose the
 * date filter precisely so a Weebly reshuffle cannot silently change which one
 * is the schedule.
 *
 * Text arrives in chunks split across sibling tags, so buffer every chunk and
 * let `<br>` decide where a logical line ends.
 */
export function parse(html: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  let buf = "";
  const flush = () => {
    const event = toEvent(collapse(decode(buf)));
    buf = "";
    if (event) events.push(event);
  };

  new HTMLRewriter()
    .on("div.paragraph br", { element: flush })
    .on("div.paragraph", {
      element: el => el.onEndTag(flush),
      text: chunk => {
        buf += chunk.text;
      },
    })
    .transform(html);

  return events;
}
