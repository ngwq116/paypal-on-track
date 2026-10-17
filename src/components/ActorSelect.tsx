import { STAFF } from "@/lib/staff";

export default function ActorSelect({ id = "actor" }: { id?: string }) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-zinc-600">
      Acting as
      <select id={id} name="actor" defaultValue={STAFF[0]} className="min-h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-950">
        {STAFF.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}
