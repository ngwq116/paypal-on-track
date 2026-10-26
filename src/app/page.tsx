import { Suspense } from "react";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { ChevronRight, FileText, Plus } from "lucide-react";
import ResetDemoForm from "@/components/ResetDemoForm";
import { buttonVariants } from "@/components/ui/button";
import { db, schema } from "@/db";
import { formatRange } from "@/lib/domain/format";

const newCampaign = (
  <a href="/campaigns/new" className={buttonVariants({ size: "main" })}>
    <Plus aria-hidden="true" />
    New campaign
  </a>
);

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 pt-8 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-zinc-600">Every campaign starts from a signed client contract.</p>
        </div>
        {newCampaign}
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading campaigns…</p>}>
        <CampaignList />
      </Suspense>
      <Suspense fallback={null}>
        <ResetDemoForm />
      </Suspense>
    </main>
  );
}

async function CampaignList() {
  await connection(); // read the DB per request, never at build time
  const rows = await db
    .select({ campaign: schema.campaigns, clientName: schema.clients.name })
    .from(schema.campaigns)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.campaigns.clientId));
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed border-zinc-300 px-6 py-10 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-zinc-100">
          <FileText className="size-6 text-zinc-700" aria-hidden="true" />
        </span>
        <strong className="text-base font-semibold">No campaigns yet</strong>
        <p className="max-w-md text-sm text-zinc-600">
          Upload a signed client contract. The AI reads the terms and you check every field before anything is created.
        </p>
        {newCampaign}
        <p className="text-xs text-zinc-500">
          Or load the demo with <code className="font-mono">npm run db:seed</code>.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200">
      {rows.map(({ campaign: c, clientName }) => (
        <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5">
          <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
            <a href={`/campaigns/${c.id}/team`} className="text-[15px] font-medium hover:underline">
              {c.name}
            </a>
            <span className="text-[13px] text-zinc-600">
              {clientName} · {formatRange(c.startDate, c.endDate)}
            </span>
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c.depositCleared ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-700"}`}
          >
            {c.depositCleared ? "Deposit received" : "Deposit not received"}
          </span>
          <a href={`/campaigns/${c.id}/team`} className={buttonVariants({ variant: "outline", size: "lg" })} aria-label={`Open ${c.name}`}>
            Open
            <ChevronRight aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
