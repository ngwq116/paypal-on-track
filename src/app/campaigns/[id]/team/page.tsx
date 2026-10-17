import { Suspense } from "react";
import { notFound } from "next/navigation";
import AssignmentsTable from "@/components/AssignmentsTable";
import CampaignHeader from "@/components/CampaignHeader";
import DepositPanel from "@/components/DepositPanel";
import Notice from "@/components/Notice";
import TeamScheduler from "@/components/TeamScheduler";
import { addDays } from "@/lib/events";
import { loadTimeline } from "@/lib/load-timeline";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

export default function TeamPage({ params, searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading campaign…</p>}>
        <TeamContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Live data, never cached: payout and approval state must always be current.
async function TeamContent({ params, searchParams }: Props) {
  const { id } = await params;
  const { notice } = await searchParams;
  const data = await loadTimeline(id);
  if (!data) notFound();
  const clientName = data.resources.find((r) => r.id === "client")?.name ?? "";
  return (
    <>
      <CampaignHeader campaign={data.campaign} clientName={clientName} active="team" />
      <Notice text={notice} />
      <DepositPanel campaignId={id} />
      <TeamScheduler
        resources={data.resources}
        events={data.events}
        startDate={data.campaign.startDate}
        endDate={addDays(data.campaign.startDate, 14)}
      />
      <AssignmentsTable campaignId={id} />
    </>
  );
}
