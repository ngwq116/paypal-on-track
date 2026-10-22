"use client";
import { STAFF } from "@/lib/staff";
import { setActor, useActor } from "./actor-cookie";

export default function NavActor() {
  const actor = useActor();
  return (
    <label className="ml-auto inline-flex items-center gap-2 text-sm text-zinc-600">
      Acting as
      <select value={actor} onChange={(e) => setActor(e.target.value)} className="min-h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-950">
        {STAFF.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}
