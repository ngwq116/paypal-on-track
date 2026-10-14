import { Suspense } from "react";
import { connection } from "next/server";
import { db, schema } from "@/db";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-8 pt-6 pb-12">
      <h1 className="text-[26px] font-semibold tracking-tight">Campaigns</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading campaigns…</p>}>
        <CampaignList />
      </Suspense>
    </main>
  );
}

async function CampaignList() {
  await connection(); // read the DB per request, never at build time
  const campaigns = await db.select().from(schema.campaigns);
  if (campaigns.length === 0) {
    return (
      <p className="rounded-[10px] border border-zinc-200 p-4 text-sm text-zinc-500">
        No campaigns yet. Run <code className="font-mono">npm run db:seed</code> to load the demo campaign.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-[10px] border border-zinc-200">
      {campaigns.map((c) => (
        <li key={c.id}>
          <a className="block p-4 text-sm font-medium hover:bg-zinc-50" href={`/campaigns/${c.id}/team`}>
            {c.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
