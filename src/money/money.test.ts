import { describe, expect, it } from "vitest";
import { formatRupees, parseRupees, sum } from "./money";

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

describe("Sums stay exact", () => {
  it("adds Bills of ₹0.10, ₹0.20 and ₹0.30 to exactly 60 paise", () => {
    const bills = ["₹0.10", "₹0.20", "₹0.30"].map((t) => parseRupees(t)!);
    expect(sum(bills)).toEqual({ paise: 60, currency: "INR" });
  });

  it("sums nothing to zero", () => {
    expect(sum([])).toEqual({ paise: 0, currency: "INR" });
  });
});

describe("display: ₹, Indian grouping, two decimals, paise as printed", () => {
  it("displays 250050 paise as ₹2,500.50", () => {
    expect(formatRupees(parseRupees("₹2,500.50")!)).toBe("₹2,500.50");
  });

  it.each([
    [12345670, "₹1,23,456.70"],
    [123456789, "₹12,34,567.89"],
    [1000000000, "₹1,00,00,000.00"],
    [118025, "₹1,180.25"],
    [9950, "₹99.50"],
    [7, "₹0.07"],
    [0, "₹0.00"],
    [-150, "-₹1.50"],
  ])("%i paise shows %s", (paise, shown) => {
    expect(formatRupees({ paise, currency: "INR" })).toBe(shown);
  });
});
