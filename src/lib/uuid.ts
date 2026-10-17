const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres throws on a malformed uuid; check first so bad ids become "not found", not a 500.
export const isUuid = (s: string): boolean => UUID.test(s);
