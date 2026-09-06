import { expect, test } from "bun:test";
import { parse, type ParsedEvent } from "../src/parse.ts";

const html = await Bun.file(new URL("golf.html", import.meta.url)).text();
const events = parse(html);
const raws = events.map(e => e.raw);
const byDate = (token: string): ParsedEvent => {
  const event = events.find(e => e.dates[0] === token);
  if (!event) throw new Error(`no event parsed for ${token}`);
  return event;
};

// The live page drifts; assert this fixture's own count. Saved 2026-09-06.
test("the fixture yields its full event count", () => {
  expect(events).toHaveLength(28);
});

test("the upper h2 Match Schedule block is not ingested", () => {
  // The h2 block lists 10/13 too (with different wording), so ingesting it
  // would yield two 10/13 events instead of one.
  expect(events.filter(e => e.dates[0] === "10/13")).toHaveLength(1);
});

test("the 8 tag-split lines come through whole", () => {
  expect(raws).toEqual(
    expect.arrayContaining([
      "9/7 No Practice: Labor Day",
      "9/15 Practice @ 12 Oaks 3:30-5:00 Possibly on course/qualifying for Devils Ridge match)",
      "9/16 North State Girls High School Challenge 4 players 12:30 (Best 4 Rankings confirmed)",
      "9/22 Sanderson match @ Wildwood 2:00 Tee Times (Best 5 Rankings)",
      "9/28 Twin Rivers High School Invitational Emerald Golf Club 12:30 (Best 4 Rankings confirmed)",
      "10/13 Conference Championship @ Keith Hills 12:15 Tee Times White to Orange Rotation (Best 5 Rankings)",
      "10/14 Pinecrest Invitational @ Pinehurst #8 1:00 (Best 4 Rankings)",
      "10/19 or 10/20 Regionals (Best 5 Rankings)",
    ]),
  );
});

test("entities are decoded and whitespace collapsed", () => {
  // Source has `3:00&nbsp;(Charlotte`.
  expect(byDate("9/8").raw).toBe(
    "9/8 Middle Creek Match @ Eagle Ridge 3:00 (Charlotte, Amelia, Taylor, Peyton, Ana)",
  );
  expect(raws.some(r => /&[a-z#]\w*;/i.test(r) || /[\u00A0\u200B]/.test(r))).toBe(false);
});

test("decode covers the references a hand-edited Weebly page can emit", () => {
  const [event] = parse(
    `<div class="paragraph">9/9 Practice &amp; Putting &#39;A&#39; &#x74;eam&nbsp;&#8203;3:30 &bogus;</div>`,
  );
  expect(event!.raw).toBe("9/9 Practice & Putting 'A' team 3:30 &bogus;");
});

test("date kinds", () => {
  expect(byDate("10/26")).toMatchObject({ dates: ["10/26", "10/27"], dateKind: "range" });
  expect(byDate("10/19")).toMatchObject({ dates: ["10/19", "10/20"], dateKind: "either" });
  expect(byDate("9/9")).toMatchObject({ dates: ["9/9"], dateKind: "single" });
});

test("type comes from keywords", () => {
  expect(byDate("9/7")).toMatchObject({ raw: "9/7 No Practice: Labor Day", type: "no-practice" });
  // Nine of ten match lines never say "match".
  expect(byDate("9/16").type).toBe("match");
  expect(byDate("10/13").type).toBe("match");
  expect(byDate("10/26").type).toBe("match");
  expect(byDate("9/9").type).toBe("practice");
  expect(byDate("10/22").type).toBe("practice");
});

test("branches the live page does not exercise today", () => {
  const edgeCases = parse(
    `<div class="paragraph">10/19, 10/22 or 10/25 Regionals<br />` +
      `9/4 Parent Meeting 6:00<br />9/5 Team Photos<br />not a date line</div>`,
  );
  // ponytail: three dates keep first and last.
  expect(edgeCases[0]).toMatchObject({ dates: ["10/19", "10/25"], dateKind: "either" });
  expect(edgeCases[1]!.type).toBe("meeting");
  expect(edgeCases[2]!.type).toBe("unknown");
  expect(edgeCases).toHaveLength(3);
});
