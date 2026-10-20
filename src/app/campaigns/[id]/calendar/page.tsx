import { Suspense } from "react";
import ActorSelect from "@/components/ActorSelect";
import { notFound } from "next/navigation";
import CampaignCalendar from "@/components/CampaignCalendar";
import CampaignHeader from "@/components/CampaignHeader";
import { loadTimeline } from "@/lib/load-timeline";

export default function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading campaign…</p>}>
        <CalendarContent params={params} />
      </Suspense>
    </main>
  );
}

// Live data, never cached: payout and approval state must always be current.
async function CalendarContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadTimeline(id);
  if (!data) notFound();
  const clientName = data.resources.find((r) => r.id === "client")?.name ?? "";
  return (
    <>
      <CampaignHeader campaign={data.campaign} clientName={clientName} active="calendar" />
      <div className="flex justify-end">
        <ActorSelect id="view-actor" />
      </div>
      <CampaignCalendar resources={data.resources} events={data.events} date={data.campaign.startDate} />
    </>
  );
}
