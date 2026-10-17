// No login yet: the acting person is picked on each form. Only these names can approve (R17).
export const STAFF = ["Mei Tan", "Hana Aziz"] as const;
export const isStaff = (name: string): boolean => (STAFF as readonly string[]).includes(name);
