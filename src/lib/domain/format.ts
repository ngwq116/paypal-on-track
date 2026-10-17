const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-29" → "Oct 29". String parsing only, never a Date.
export function formatDay(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
