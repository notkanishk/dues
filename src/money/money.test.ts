import { describe, expect, it } from "vitest";
import { claimTotal, formAmount, formatRupees, parseRupees, sum, zero } from "./money";

// platform-foundations: "Money stored as integer paise". Expected values are the spec's own literals.
describe("Money stored as integer paise", () => {
  it("stores a Payment of ₹2,500.50 as 250050 paise with currency INR", () => {
    expect(parseRupees("₹2,500.50")).toEqual({ paise: 250050, currency: "INR" });
  });

  it("zero is ₹0.00 INR", () => {
    expect(zero).toEqual({ paise: 0, currency: "INR" });
    expect(formatRupees(zero)).toBe("₹0.00");
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
    ["1,00,000", 10000000],
    ["100,000", 10000000],
  ])("%s is %i paise", (text, paise) => {
    expect(parseRupees(text)?.paise).toBe(paise);
  });

  it.each(["", "₹", "abc", "2.505", "-5", "1e3", "1,,000", ",100", "12.", "Infinity", "99999999999999999", "1,50", "1,000,00"])(
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

// platform-foundations: "Paise kept as printed; only the Claim total is rounded".
describe("Paise kept as printed; only the Claim total is rounded", () => {
  it("keeps an Invoice for ₹1,180.25 as 118025 paise, shown 1180.25/- on its Claim line", () => {
    const bill = parseRupees("₹1,180.25")!;
    expect(bill.paise).toBe(118025);
    expect(formAmount(bill)).toBe("1180.25/-");
  });

  it("keeps both lines' paise on the form; only the total shows ₹1,280.00", () => {
    const lines = [parseRupees("₹1,180.25")!, parseRupees("₹99.50")!];
    expect(lines.map(formAmount)).toEqual(["1180.25/-", "99.50/-"]);
    expect(formatRupees(claimTotal(lines))).toBe("₹1,280.00");
  });

  it.each([
    [[128000], 128000], // already whole rupees: unchanged
    [[1], 100], // one paisa rounds up a whole rupee
    [[10, 20, 30], 100],
    [[], 0],
  ])("Claim lines %j total %i paise", (paise, total) => {
    expect(claimTotal(paise.map((p) => ({ paise: p, currency: "INR" as const })))).toEqual({
      paise: total,
      currency: "INR",
    });
  });
});

// claims spec, "Total rounded up": the scenarios' own figures, typed by hand.
describe("Total rounded up", () => {
  it.each([
    ["₹2,360.25", "₹2,361.00"], // Round up
    ["₹2,360.00", "₹2,360.00"], // Already whole
    ["₹2,360.01", "₹2,361.00"], // One paisa over
    ["₹410.40", "₹411.00"], // Every Fund
  ])("Claim lines summing to %s total %s", (lines, total) => {
    expect(formatRupees(claimTotal([parseRupees(lines)!]))).toBe(total);
  });

  it("Lines unchanged: each Claim line keeps its exact paise", () => {
    const lines = [parseRupees("₹2,000.20")!, parseRupees("₹360.05")!];
    claimTotal(lines);
    expect(lines).toEqual([
      { paise: 200020, currency: "INR" },
      { paise: 36005, currency: "INR" },
    ]);
  });
});

describe("a Claim total outside the possible range throws", () => {
  it("throws a RangeError when rounding up leaves the safe-integer range", () => {
    // 9007199254740991 is Number.MAX_SAFE_INTEGER; its sum is safe, its round-up is not.
    expect(() => claimTotal([{ paise: 9007199254740991, currency: "INR" }])).toThrow(RangeError);
  });
});

describe("a negative Claim total is impossible", () => {
  it("throws when Claim lines sum below zero", () => {
    expect(() => claimTotal([{ paise: 100, currency: "INR" }, { paise: -250, currency: "INR" }])).toThrow(RangeError);
  });
});

describe("formatting refuses paise that are not a safe integer", () => {
  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])("%d paise", (paise) => {
    const m = { paise, currency: "INR" as const };
    expect(() => formatRupees(m)).toThrow(RangeError);
    expect(() => formAmount(m)).toThrow(RangeError);
  });
});
