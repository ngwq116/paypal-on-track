import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { getCampaignAssignments } from "@/lib/services/queries";

const STATUS: Record<string, string> = { scheduled: "Scheduled", submitted: "Submitted", verified: "Verified", held: "Held", paid: "Paid" };

export default async function AssignmentsTable({ campaignId }: { campaignId: string }) {
  const rows = await getCampaignAssignments(campaignId);
  return (
    <section aria-label="Assignments" className="overflow-x-auto rounded-[10px] border border-zinc-200">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
          <tr>
            <th className="px-4 py-3">Creator</th>
            <th className="px-4 py-3">Deliverable</th>
            <th className="px-4 py-3">Fee</th>
            <th className="px-4 py-3">Due</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map(({ assignment, creator }) => (
            <tr key={assignment.id}>
              <td className="px-4 py-3 font-medium">{creator.name}</td>
              <td className="px-4 py-3 text-zinc-600">{assignment.deliverable}</td>
              <td className="px-4 py-3 tabular-nums">{formatUsd(assignment.feeCents)}</td>
              <td className="px-4 py-3 tabular-nums">{formatDay(assignment.dueDate)}</td>
              <td className={`px-4 py-3 ${assignment.status === "held" ? "font-medium text-red-700" : ""}`}>{STATUS[assignment.status]}</td>
              <td className="px-4 py-3 text-right">
                <a href={`/campaigns/${campaignId}/assignments/${assignment.id}`} className="text-zinc-600 underline-offset-4 hover:underline">
                  {creator.type === "influencer" ? "Verify post" : "Invoice"}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
