import { STAFF } from "@/lib/staff";

// No login yet: the views have an "Acting as" picker with this id; a drag is recorded under that name.
export function readActor(): string {
  const el = document.getElementById("view-actor");
  return el instanceof HTMLSelectElement ? el.value : STAFF[0];
}
