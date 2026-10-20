import { Suspense } from "react";
import { notFound } from "next/navigation";
import ActorSelect from "@/components/ActorSelect";
import BalanceProposal from "@/components/BalanceProposal";
import CampaignCalendar from "@/components/CampaignCalendar";
import CampaignHeader from "@/components/CampaignHeader";
import Notice from "@/components/Notice";
import { loadTimeline } from "@/lib/load-timeline";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

export default function CalendarPage({ params, searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading campaign…</p>}>
        <CalendarContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Live data, never cached: payout and approval state must always be current.
async function CalendarContent({ params, searchParams }: Props) {
  const { id } = await params;
  const { notice } = await searchParams;
  const data = await loadTimeline(id);
  if (!data) notFound();
  const clientName = data.resources.find((r) => r.id === "client")?.name ?? "";
  return (
    <>
      <CampaignHeader campaign={data.campaign} clientName={clientName} active="calendar" />
      <Notice text={notice} />
      <BalanceProposal campaignId={id} view="calendar" />
      <div className="flex justify-end">
        <ActorSelect id="view-actor" />
      </div>
      <CampaignCalendar resources={data.resources} events={data.events} date={data.campaign.startDate} />
    </>
  );
}
