import { describe, expect, it } from "vitest";
import { COUNTRIES, currencyForCountry, currencySign } from "@/lib/localization";
import { businessDate, formatBusinessDate, formatBusinessMoney, formatCompactBusinessMoney } from "@/lib/utils";

describe("country-aware workspace currency", () => {
  it("offers international countries and derives their default currency", () => {
    expect(COUNTRIES.some((country) => country.code === "US")).toBe(true);
    expect(COUNTRIES.some((country) => country.code === "NG")).toBe(true);
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("NG")).toBe("NGN");
    expect(currencyForCountry("GB")).toBe("GBP");
  });

  it("formats money using the selected workspace country and currency", () => {
    expect(formatBusinessMoney(1_234, { country: "US", currency: "USD" })).toBe("$1,234");
    expect(formatBusinessMoney(1_234.5, { country: "US", currency: "USD" })).toBe("$1,234.50");
    expect(formatBusinessMoney(1_234, { country: "NG", currency: "NGN" })).toContain("₦");
    expect(currencySign("USD", "US")).toBe("$");
  });

  it("uses the selected currency for compact dashboard totals", () => {
    expect(formatCompactBusinessMoney(1_250_000, { country: "US", currency: "USD" })).toContain("$");
    expect(formatCompactBusinessMoney(1_250_000, { country: "US", currency: "USD" })).toMatch(/M/i);
  });

  it("uses the workspace timezone for date-only business reporting", () => {
    const business = { country: "US", timezone: "America/Los_Angeles" };
    expect(businessDate("2026-10-01T01:00:00.000Z", business)).toBe("2026-09-30");
    expect(formatBusinessDate("2026-10-01T01:00:00.000Z", business)).toContain("30");
  });
});
