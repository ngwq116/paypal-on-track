// One agency, one signed-in user (PRD non-goal: no login or roles). Only staff can approve (R17).
export const STAFF = ["Wanz", "Hana Aziz"] as const;
export const isStaff = (name: string): boolean => (STAFF as readonly string[]).includes(name);

// Who is signed in. Every server action records this name in the audit log (R21).
// A real login would read the session here; nothing else needs to change.
export const currentStaff = (): string => STAFF[0];
