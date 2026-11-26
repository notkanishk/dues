import { describe, expect, it } from "vitest";
import { parseRupees } from "./money";

// platform-foundations: "Money stored as integer paise". Expected values are the spec's own literals.
describe("Money stored as integer paise", () => {
  it("stores a Payment of ₹2,500.50 as 250050 paise with currency INR", () => {
    expect(parseRupees("₹2,500.50")).toEqual({ paise: 250050, currency: "INR" });
  });
});
