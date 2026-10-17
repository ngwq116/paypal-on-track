import { redirect } from "next/navigation";
import type { UploadedFile } from "@/lib/domain/upload";
import { isStaff } from "@/lib/staff";

export const text = (form: FormData, key: string): string => String(form.get(key) ?? "");

export function actorFrom(form: FormData): string {
  const actor = text(form, "actor");
  if (!isStaff(actor)) throw new Error("Unknown staff member");
  return actor;
}

// Back to the page with a one-line notice (shown by <Notice>). Always a local path.
export function backTo(path: string, notice: string): never {
  redirect(`${path.startsWith("/") ? path : "/"}?notice=${encodeURIComponent(notice)}`);
}

export async function fileFrom(form: FormData, key: string): Promise<UploadedFile | null> {
  const f = form.get(key);
  if (!(f instanceof File) || f.size === 0) return null;
  return { name: f.name, type: f.type, size: f.size, bytes: Buffer.from(await f.arrayBuffer()) };
}
