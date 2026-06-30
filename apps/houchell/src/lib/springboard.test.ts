import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toResponseRows, summarise } from "./springboard.js";

describe("toResponseRows", () => {
  it("returns [] when signals is not an array", () => {
    expect(toResponseRows("s1", null)).toEqual([]);
    expect(toResponseRows("s1", undefined)).toEqual([]);
    expect(toResponseRows("s1", {} as any)).toEqual([]);
    expect(toResponseRows("s1", "B1#1" as any)).toEqual([]);
  });

  it("normalises a clean batch into the expected rows", () => {
    const rows = toResponseRows("stu-1", [
      { qid: "B1#3", correct: true, session: "lesson", at: "2026-01-02T10:00:00.000Z" },
      { qid: "C2#10", correct: false, session: "exam" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      student_id: "stu-1",
      unit_code: "B1",
      qid: "B1#3",
      is_correct: true,
      session: "lesson",
      answered_at: "2026-01-02T10:00:00.000Z",
    });
    expect(rows[1]).toMatchObject({
      student_id: "stu-1",
      unit_code: "C2",
      qid: "C2#10",
      is_correct: false,
      session: "exam",
    });
  });

  it("derives unit_code from the qid prefix, not from any client field", () => {
    const rows = toResponseRows("s", [
      // a spoofed unit_code property must be ignored; prefix B1 wins
      { qid: "B1#7", correct: true, unit_code: "Z9" } as any,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].unit_code).toBe("B1");
  });

  it("parses the <unitCode>#<index> scheme with multi-char unit codes", () => {
    const rows = toResponseRows("s", [
      { qid: "P3a#42", correct: true },
      { qid: "AQA-B1#5", correct: false },
    ]);
    expect(rows.map((r) => r.unit_code)).toEqual(["P3a", "AQA-B1"]);
    expect(rows.map((r) => r.qid)).toEqual(["P3a#42", "AQA-B1#5"]);
  });

  it("drops malformed / garbage answers without throwing", () => {
    const rows = toResponseRows("s", [
      null,
      undefined,
      42,
      "B1#1",
      { qid: 5, correct: true },           // qid not a string
      { qid: "B1#1", correct: "yes" },     // correct not a boolean
      { correct: true },                    // missing qid
      { qid: "B1", correct: true },         // no '#index'
      { qid: "B1#", correct: true },        // missing index
      { qid: "#5", correct: true },         // missing unit code
      { qid: "B1#abc", correct: true },     // non-numeric index
      { qid: "B1#1#2", correct: true },     // extra '#'
      { qid: "B1#1 ", correct: true },      // trailing space breaks anchored regex
    ]);
    expect(rows).toEqual([]);
  });

  it("rejects an over-long unit code (>32 chars) and a too-long index (>6 digits)", () => {
    const longCode = "x".repeat(33);
    const rows = toResponseRows("s", [
      { qid: `${longCode}#1`, correct: true },
      { qid: "B1#1234567", correct: true }, // 7-digit index
    ]);
    expect(rows).toEqual([]);
  });

  it("de-dupes within a batch, keeping the FIRST occurrence of a qid", () => {
    const rows = toResponseRows("s", [
      { qid: "B1#1", correct: true, session: "lesson" },
      { qid: "B1#1", correct: false, session: "exam" }, // dropped
      { qid: "B1#2", correct: true },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.qid)).toEqual(["B1#1", "B1#2"]);
    expect(rows[0].is_correct).toBe(true); // first one wins
    expect(rows[0].session).toBe("lesson");
  });

  it("defaults an unknown/missing session to 'lesson'", () => {
    const rows = toResponseRows("s", [
      { qid: "B1#1", correct: true },                       // no session
      { qid: "B1#2", correct: true, session: "bogus" },     // invalid
      { qid: "B1#3", correct: true, session: 99 } as any,   // non-string
    ]);
    expect(rows.map((r) => r.session)).toEqual(["lesson", "lesson", "lesson"]);
  });

  it("accepts each whitelisted session verbatim", () => {
    const sessions = ["lesson", "review", "weak", "recap", "exam"];
    const rows = toResponseRows(
      "s",
      sessions.map((session, i) => ({ qid: `B1#${i}`, correct: true, session })),
    );
    expect(rows.map((r) => r.session)).toEqual(sessions);
  });

  it("falls back to 'now' when 'at' is missing or unparseable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T12:00:00.000Z"));
    const rows = toResponseRows("s", [
      { qid: "B1#1", correct: true },                      // no at
      { qid: "B1#2", correct: true, at: "not-a-date" },    // bad at
    ]);
    vi.useRealTimers();
    expect(rows[0].answered_at).toBe("2026-06-30T12:00:00.000Z");
    expect(rows[1].answered_at).toBe("2026-06-30T12:00:00.000Z");
  });

  it("caps the batch at 500 items before processing", () => {
    const big = Array.from({ length: 600 }, (_, i) => ({ qid: `B1#${i}`, correct: true }));
    const rows = toResponseRows("s", big);
    expect(rows).toHaveLength(500); // hard cap applied via slice(0,500)
  });
});

describe("summarise", () => {
  it("returns all-zero for empty / nullish state", () => {
    expect(summarise(null)).toEqual({ xp: 0, streak: 0, words: 0, crowns: 0 });
    expect(summarise(undefined)).toEqual({ xp: 0, streak: 0, words: 0, crowns: 0 });
    expect(summarise({})).toEqual({ xp: 0, streak: 0, words: 0, crowns: 0 });
  });

  it("coerces xp / streak / words to numbers, defaulting bad values to 0", () => {
    expect(summarise({ xp: 120, streak: 5, words: 30 })).toMatchObject({ xp: 120, streak: 5, words: 30 });
    expect(summarise({ xp: "250", streak: "7", words: "12" })).toMatchObject({ xp: 250, streak: 7, words: 12 });
    expect(summarise({ xp: "abc", streak: null, words: undefined })).toMatchObject({ xp: 0, streak: 0, words: 0 });
  });

  it("counts a crown only for completed lesson nodes ending in -L<n>", () => {
    const out = summarise({
      lessons: {
        "B1-L1": { done: true },
        "B1-L2": { done: true },
        "B1-L3": { done: false }, // not done -> no crown
        "B1-intro": { done: true }, // wrong id shape -> no crown
      },
    });
    expect(out.crowns).toBe(2);
  });

  it("does not count real review-/weak- session ids (they lack the -L<n> suffix)", () => {
    const out = summarise({
      lessons: {
        "B1-L1": { done: true },     // crown
        "review-1": { done: true },  // not a crown
        "weak-B1": { done: true },   // not a crown
        "recap-3": { done: true },   // not a crown
      },
    });
    expect(out.crowns).toBe(1);
  });

  it("ignores falsy lesson entries while scanning for crowns", () => {
    const out = summarise({
      lessons: {
        "B1-L1": { done: true },
        "B1-L2": null,
        "B1-L3": undefined,
        "B1-L4": false,
      },
    });
    expect(out.crowns).toBe(1);
  });
});
