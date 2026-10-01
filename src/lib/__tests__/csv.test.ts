import { describe, expect, it } from "vitest";
import { inferColumnMapping, missingRequiredMappings, parseBankDate, parseCsvText, parseMoneyAmount, parseNairaAmount, parseNigerianDate, validateCsvRows } from "@/lib/csv";
import { lagosDate } from "@/lib/utils";

describe("CSV parsing and validation", () => {
  it("parses a quoted CSV row without losing commas in descriptions", () => {
    const csv = 'Date,Description,Amount,Reference\n01/10/2026,"Transfer from Amina, Osogbo",125000,NIP-123';
    const parsed = parseCsvText(csv);
    expect(parsed.headers).toEqual(["Date", "Description", "Amount", "Reference"]);
    expect(parsed.rows[0].values.Description).toBe("Transfer from Amina, Osogbo");
  });

  it("uses country-aware slash dates and unambiguous ISO dates", () => {
    expect(parseNigerianDate("03/04/2026")).toBe("2026-04-03");
    expect(parseBankDate("03/04/2026", "US")).toBe("2026-03-04");
    expect(parseBankDate("03/04/2026 9:00 AM", "US", true, "America/New_York")).toBe("2026-03-04T14:00:00.000Z");
    expect(parseNigerianDate("2026-10-01")).toBe("2026-10-01");
    expect(parseNigerianDate("31/02/2026")).toBeNull();
  });

  it("validates US orders using the selected currency and date convention", () => {
    const parsed = parseCsvText('order number,customer name,order date,amount\nUS-1,Jane Doe,03/04/2026,"$1,234.56"');
    const mapping = inferColumnMapping("orders", parsed.headers);
    const validated = validateCsvRows("orders", parsed.rows, mapping, "US");
    expect(validated.invalid).toHaveLength(0);
    expect(validated.valid[0]).toMatchObject({ orderDate: "2026-03-04", amount: 1_234.56 });
  });

  it("uses Africa/Lagos calendar dates for timestamped evidence", () => {
    expect(lagosDate("2026-09-30T23:30:00.000Z")).toBe("2026-10-01");
  });

  it("parses currency symbols, ISO codes, decimals and debit notation", () => {
    expect(parseNairaAmount("₦1,250,000.50")).toEqual({ amount: 1_250_000.5, negative: false });
    expect(parseNairaAmount("(₦12,450.00)")).toEqual({ amount: 12_450, negative: true });
    expect(parseMoneyAmount("$1,234.56", "US")).toEqual({ amount: 1_234.56, negative: false });
    expect(parseMoneyAmount("EUR 1.234,56", "DE")).toEqual({ amount: 1_234.56, negative: false });
    expect(parseMoneyAmount("EUR 100.00", "US")).toBeNull();
    expect(parseMoneyAmount("€100.00", "US")).toBeNull();
    expect(parseMoneyAmount("not money")).toBeNull();
  });

  it("infers separate bank credit/debit columns and validates both directions", () => {
    const parsed = parseCsvText("Date,Description,Reference,Credit,Debit\n01/10/2026,Customer transfer,NIP-1,85000,\n02/10/2026,Stock supplier,DB-1,,25000");
    const mapping = inferColumnMapping("transactions", parsed.headers);
    expect(mapping.transactionDate).toBe("Date");
    expect(mapping.creditAmount).toBe("Credit");
    expect(mapping.debitAmount).toBe("Debit");
    expect(missingRequiredMappings("transactions", mapping)).toEqual([]);
    const validated = validateCsvRows("transactions", parsed.rows, mapping);
    expect(validated.invalid).toHaveLength(0);
    expect(validated.valid.map((row) => row.kind === "transactions" ? [row.amount, row.type] : null)).toEqual([[85_000, "credit"], [25_000, "debit"]]);
  });

  it("reports invalid rows instead of silently skipping them", () => {
    const parsed = parseCsvText("order number,customer name,order date,amount\nORD-1,Chika Madu,31/02/2026,5000\nORD-2,,01/10/2026,8000");
    const mapping = inferColumnMapping("orders", parsed.headers);
    const validated = validateCsvRows("orders", parsed.rows, mapping);
    expect(validated.valid).toHaveLength(0);
    expect(validated.invalid).toHaveLength(2);
    expect(validated.invalid[0].reasons.join(" ")).toContain("valid DD/MM/YYYY");
    expect(validated.invalid[1].reasons.join(" ")).toContain("Customer name is required");
  });
});
