import { ChevronRight, Check, FileText, RotateCcw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { getCampaignAssignments } from "@/lib/services/queries";

type Row = Awaited<ReturnType<typeof getCampaignAssignments>>[number];
type Status = Row["assignment"]["status"];
type Kind = "influencer" | "freelancer";

const CHIP: Record<Kind, Record<Status, [string, string]>> = {
  influencer: {
    scheduled: ["Waiting for post", "bg-zinc-100 text-zinc-700"],
    submitted: ["Submitted", "bg-zinc-100 text-zinc-700"],
    held: ["Held", "bg-red-100 text-red-800"],
    verified: ["Verified", "bg-green-100 text-green-800"],
    paid: ["Paid", "bg-green-100 text-green-800"],
  },
  freelancer: {
    scheduled: ["No invoice yet", "bg-zinc-100 text-zinc-700"],
    submitted: ["Invoice submitted", "bg-zinc-100 text-zinc-700"],
    held: ["Held · doesn't match", "bg-red-100 text-red-800"],
    verified: ["Invoice matches", "bg-green-100 text-green-800"],
    paid: ["Paid", "bg-green-100 text-green-800"],
  },
};

// Black = waiting on you, red = held (needs a new file), outlined = done (read only).
function NextStep({ kind, status, href }: { kind: Kind; status: Status; href: string }) {
  const post = kind === "influencer";
  if (status === "held") {
    return (
      <a href={href} className={buttonVariants({ variant: "destructive" })}>
        <RotateCcw aria-hidden="true" />
        {post ? "Re-check post" : "Fix invoice"}
      </a>
    );
  }
  if (status === "verified" || status === "paid") {
    return (
      <a href={href} className={buttonVariants({ variant: "outline" })}>
        {post ? "View post" : "View invoice"}
        <ChevronRight aria-hidden="true" />
      </a>
    );
  }
  return (
    <a href={href} className={buttonVariants()}>
      {post ? <Check aria-hidden="true" /> : <FileText aria-hidden="true" />}
      {post ? "Verify post" : "Check invoice"}
    </a>
  );
}

const th = "px-3 py-2.5 font-medium";
const td = "px-3 py-3";

function KindTable({ kind, rows, campaignId }: { kind: Kind; rows: Row[]; campaignId: string }) {
  if (rows.length === 0) return null;
  const influencer = kind === "influencer";
  const total = rows.reduce((s, r) => s + r.assignment.feeCents, 0);
  const id = `${kind}-heading`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2.5 text-lg font-semibold">
          <span aria-hidden="true" className={`size-2.5 rounded-[3px] ${influencer ? "bg-violet-300" : "bg-orange-300"}`} />
          {influencer ? "Influencers" : "Freelancers"}
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[13px] font-medium text-zinc-600">{rows.length}</span>
        </h2>
        <span className="text-[13px] text-zinc-600">
          {influencer ? "Paid after the post passes its checklist" : "Paid after their invoice matches the contract"} · {formatUsd(total)} total
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-600">
            <tr>
              <th className={`${th} pl-4`}>{influencer ? "Influencer" : "Freelancer"}</th>
              <th className={th}>Deliverable</th>
              <th className={th}>{influencer ? "Post between" : "Due"}</th>
              <th className={`${th} text-right`}>Fee</th>
              <th className={th}>{influencer ? "Status" : "Invoice"}</th>
              <th className={`${th} pr-4 text-right`}>Next step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map(({ assignment: a, creator }) => {
              const [label, chip] = CHIP[kind][a.status];
              return (
                <tr key={a.id}>
                  <td className={`${td} pl-4`}>
                    <div className="font-medium">{creator.name}</div>
                    <div className="text-xs text-zinc-600">{creator.detail}</div>
                  </td>
                  <td className={`${td} text-zinc-700`}>{a.deliverable}</td>
                  <td className={`${td} text-zinc-700 tabular-nums`}>
                    {influencer && a.brief ? `${formatDay(a.brief.windowStart)} – ${formatDay(a.brief.windowEnd)}` : formatDay(a.dueDate)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{formatUsd(a.feeCents)}</td>
                  <td className={td}>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${chip}`}>{label}</span>
                  </td>
                  <td className={`${td} pr-4 text-right`}>
                    <NextStep kind={kind} status={a.status} href={`/campaigns/${campaignId}/assignments/${a.id}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AssignmentsTable({ campaignId }: { campaignId: string }) {
  const rows = await getCampaignAssignments(campaignId);
  return (
    <div className="flex flex-col gap-8">
      <KindTable kind="influencer" rows={rows.filter((r) => r.creator.type === "influencer")} campaignId={campaignId} />
      <KindTable kind="freelancer" rows={rows.filter((r) => r.creator.type === "freelancer")} campaignId={campaignId} />
    </div>
  );
}
