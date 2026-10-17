// "1,200.00", "1200", "$1,000.10" → cents. Anything else (negative, zero, 3 decimals, bad commas) → null.
export function parseUsdToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "");
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function formatUsd(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
