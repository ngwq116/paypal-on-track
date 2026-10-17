import { Suspense } from "react";
import { notFound } from "next/navigation";
import InvoiceSection from "@/components/InvoiceSection";
import Notice from "@/components/Notice";
import PostCheckSection from "@/components/PostCheckSection";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { getAssignmentDetail } from "@/lib/services/queries";

type Props = { params: Promise<{ id: string; assignmentId: string }>; searchParams: Promise<{ notice?: string }> };

export default function AssignmentPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Content {...props} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Props) {
  const { id, assignmentId } = await params;
  const { notice } = await searchParams;
  const detail = await getAssignmentDetail(assignmentId);
  if (!detail || detail.campaign.id !== id) notFound();
  const { creator, assignment, campaign } = detail;
  const influencer = creator.type === "influencer";

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1.5 text-[13px] text-zinc-500">
          <a href="/" className="hover:text-zinc-950">Campaigns</a>
          <span aria-hidden="true">/</span>
          <a href={`/campaigns/${campaign.id}/team`} className="hover:text-zinc-950">{campaign.name}</a>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-950">{influencer ? "Verify post" : "Invoice"}</span>
        </nav>
        <h1 className="text-[26px] font-semibold tracking-tight">{influencer ? "Verify post" : "Invoice"} · {creator.name}</h1>
        <p className="text-sm text-zinc-500">
          {influencer ? "Influencer" : "Freelancer"} · {creator.detail} · contract fee {formatUsd(assignment.feeCents)} · due {formatDay(assignment.dueDate)}
        </p>
      </div>
      <Notice text={notice} />
      {influencer ? <PostCheckSection detail={detail} /> : <InvoiceSection detail={detail} />}
    </>
  );
}
