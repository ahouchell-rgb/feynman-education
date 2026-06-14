import { describe, it, expect } from "vitest";
import { localMark, detectFakeAnswer } from "./marking.js";

describe("localMark", () => {
  it("blank answer scores zero", () => {
    const r = localMark("Q", "mitochondria", "   ", 1);
    expect(r).toEqual({ correct: false, marks_awarded: 0, feedback: "No answer given." });
  });

  it("exact match (case/punctuation-insensitive) is full marks", () => {
    const r = localMark("Q", "Mitochondria", "mitochondria!", 1);
    expect(r.correct).toBe(true);
    expect(r.marks_awarded).toBe(1);
    expect(r.feedback).toBe("Correct!");
  });

  it("all key terms present (different word order) = full marks", () => {
    const r = localMark("Q", "the powerhouse of the cell", "cell powerhouse", 2);
    expect(r.correct).toBe(true);
    expect(r.marks_awarded).toBe(2);
  });

  it("tolerates a 1-2 character typo in a key term", () => {
    const r = localMark("Q", "mitochondria", "mitochondia", 1); // missing 'r'
    expect(r.correct).toBe(true);
    expect(r.marks_awarded).toBe(1);
  });

  it("~60% of key terms = partial credit with encouraging feedback", () => {
    // model has 5 key terms; student matches 3 of them (ratio 0.6)
    const r = localMark("Q", "photosynthesis produces glucose oxygen water", "glucose oxygen water", 3);
    expect(r.correct).toBe(true);
    expect(r.marks_awarded).toBe(2); // ceil(3 * 0.6) = 2
    expect(r.feedback).toBe("Good — most key points covered.");
  });

  it("short model answer matched by containment", () => {
    const r = localMark("Q", "pH", "the pH is 7", 1);
    expect(r.correct).toBe(true);
    expect(r.marks_awarded).toBe(1);
  });

  it("clearly wrong answer scores zero and reveals the model answer", () => {
    const r = localMark("Q", "respiration releases energy from glucose", "the sky is blue today", 2);
    expect(r.correct).toBe(false);
    expect(r.marks_awarded).toBe(0);
    expect(r.feedback).toContain("respiration releases energy from glucose");
  });
});

describe("detectFakeAnswer", () => {
  it("flags too-short non-scientific answers", () => {
    expect(detectFakeAnswer("x")).toMatch(/too short/i);
  });

  it("accepts legitimate short scientific answers (number, symbol, genotype)", () => {
    expect(detectFakeAnswer("92")).toBeNull();
    expect(detectFakeAnswer("Fe")).toBeNull();
    expect(detectFakeAnswer("Bb")).toBeNull();
  });

  it("flags repeated letters but allows repeated digits", () => {
    expect(detectFakeAnswer("aaaa")).toMatch(/repeated characters/i);
    expect(detectFakeAnswer("9999")).toBeNull(); // numbers can legitimately repeat
  });

  it("flags the same word repeated", () => {
    expect(detectFakeAnswer("test test test")).toMatch(/same word/i);
  });

  it("flags vowel-less keyboard mashing", () => {
    expect(detectFakeAnswer("bcdfg")).toMatch(/doesn't look like a real answer/i);
  });

  it("does not reject real science words whose only vowel is 'y'", () => {
    for (const w of ["rhythm", "lymph", "crypt", "glycyl"]) {
      expect(detectFakeAnswer(w)).toBeNull();
    }
  });

  it("flags explicit non-attempts", () => {
    expect(detectFakeAnswer("I don't know")).toMatch(/attempt/i);
    expect(detectFakeAnswer("idk")).toMatch(/attempt/i);
    expect(detectFakeAnswer("???")).toMatch(/attempt/i);
  });

  it("passes a genuine answer through (null = not fake)", () => {
    expect(detectFakeAnswer("Mitochondria release energy")).toBeNull();
  });
});
