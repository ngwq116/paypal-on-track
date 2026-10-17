import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AGENCY_TZ } from "@/lib/domain/today";
import { formatUsd } from "@/lib/domain/money";
import { loadTimeline } from "@/lib/load-timeline";
import { listAuditEvents } from "@/lib/services/queries";

type Props = { params: Promise<{ id: string }> };
const when = new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// One readable line per event; amounts in cents become dollars.
function describe(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([k]) => !k.endsWith("Id") && k !== "eventId")
    .map(([k, v]) => `${k}: ${typeof v === "number" && /cents/i.test(k) ? formatUsd(v) : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function AuditPage({ params }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading audit log…</p>}>
        <Audit params={params} />
      </Suspense>
    </main>
  );
}

async function Audit({ params }: Props) {
  const { id } = await params;
  const data = await loadTimeline(id);
  if (!data) notFound();
  const events = await listAuditEvents(id);
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-zinc-500">
        <a href="/" className="hover:text-zinc-950">Campaigns</a>
        <span aria-hidden="true">/</span>
        <a href={`/campaigns/${id}/team`} className="hover:text-zinc-950">{data.campaign.name}</a>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-950">Audit log</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight">Audit log</h1>
      <ol className="divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 text-sm">
        {events.length === 0 && <li className="px-4 py-6 text-zinc-500">Nothing logged yet.</li>}
        {events.map((e) => (
          <li key={e.id} className="grid grid-cols-[110px_120px_1fr] gap-3 px-4 py-3">
            <span className="tabular-nums text-zinc-500">{when.format(e.at)}</span>
            <span className="font-medium">{e.actor}</span>
            <span>
              <span className="font-mono text-xs">{e.action}</span>
              <span className="block text-zinc-600">{describe(e.detail as Record<string, unknown>)}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
