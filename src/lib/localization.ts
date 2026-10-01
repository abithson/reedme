import countryToCurrency from "country-to-currency";

export const DEFAULT_COUNTRY = "NG";
export const CURRENCY_BY_COUNTRY: Record<string, string> = countryToCurrency;

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export const COUNTRIES = Object.entries(CURRENCY_BY_COUNTRY)
  .filter(([code]) => code !== "AN")
  .map(([code, currency]) => ({
    code,
    name: regionNames.of(code) ?? code,
    currency,
  }))
  .filter((country) => country.name !== country.code)
  .sort((left, right) => left.name.localeCompare(right.name, "en"));

export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(CURRENCY_BY_COUNTRY, value.toUpperCase()) && value.toUpperCase() !== "AN";
}

export function normalizeCountryCode(value: unknown, fallback = DEFAULT_COUNTRY): string {
  return isCountryCode(value) ? value.toUpperCase() : fallback;
}

export function detectBrowserCountry(): string {
  if (typeof navigator === "undefined") return DEFAULT_COUNTRY;
  try {
    return normalizeCountryCode(new Intl.Locale(navigator.language).region);
  } catch {
    return DEFAULT_COUNTRY;
  }
}

export function currencyForCountry(country: string): string {
  return CURRENCY_BY_COUNTRY[normalizeCountryCode(country)] ?? "NGN";
}

export function countryName(country: string): string {
  return regionNames.of(normalizeCountryCode(country)) ?? country;
}

export function localeForCountry(country: string): string {
  return `en-${normalizeCountryCode(country)}`;
}

export function currencyName(currency: string, country: string): string {
  try {
    return new Intl.DisplayNames([localeForCountry(country)], { type: "currency" }).of(currency.toUpperCase()) ?? currency.toUpperCase();
  } catch {
    return currency.toUpperCase();
  }
}

export function currencySign(currency: string, country: string): string {
  try {
    const parts = new Intl.NumberFormat(localeForCountry(country), {
      style: "currency",
      currency: currency.toUpperCase(),
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? currency.toUpperCase();
  } catch {
    return currency.toUpperCase();
  }
}
