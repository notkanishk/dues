import { describe, expect, it } from "vitest";
import { parseRupees } from "./money";

// platform-foundations: "Money stored as integer paise". Expected values are the spec's own literals.
describe("Money stored as integer paise", () => {
  it("stores a Payment of ₹2,500.50 as 250050 paise with currency INR", () => {
    expect(parseRupees("₹2,500.50")).toEqual({ paise: 250050, currency: "INR" });
  });
});

describe("parsing typed amounts never goes through a float", () => {
  it.each([
    ["₹1,23,456.7", 12345670],
    ["2500", 250000],
    ["₹ 99.5", 9950],
    ["1,234,567.89", 123456789],
    // Each of these is off by one paisa if computed as parseFloat(x) * 100, then truncated.
    ["1.15", 115],
    ["4.35", 435],
    ["0.07", 7],
    ["0.29", 29],
  ])("%s is %i paise", (text, paise) => {
    expect(parseRupees(text)?.paise).toBe(paise);
  });

  it.each(["", "₹", "abc", "2.505", "-5", "1e3", "1,,000", ",100", "12.", "Infinity", "99999999999999999"])(
    "%j is not an amount",
    (text) => {
      expect(parseRupees(text)).toBeNull();
    },
  );
});
