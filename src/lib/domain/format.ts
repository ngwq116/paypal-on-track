const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-29" → "Oct 29". String parsing only, never a Date.
export function formatDay(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

// "2026-10-19", "2026-11-20" → "Oct 19 – Nov 20, 2026". String parsing only, no Date (no timezone shift).
export function formatRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const s = `${MONTHS[sm - 1]} ${sd}`;
  const e = `${MONTHS[em - 1]} ${ed}`;
  return sy === ey ? `${s} – ${e}, ${ey}` : `${s}, ${sy} – ${e}, ${ey}`;
}

// "2026-10-19" and a real calendar day (no Feb 30). Uses Date only to validate, in UTC.
export function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
