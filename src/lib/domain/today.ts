export const AGENCY_TZ = "Asia/Kuala_Lumpur";

// The agency's calendar day as YYYY-MM-DD. The only place a Date becomes a calendar day.
export function agencyToday(now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: AGENCY_TZ, year: "numeric", month: "2-digit", day: "2-digit"}).format(now);
}