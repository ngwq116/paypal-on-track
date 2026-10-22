import { campaignSummary } from "@/lib/domain/summary";
import { formatUsd } from "@/lib/domain/money";
import { getSummaryInput } from "@/lib/services/queries";

export default async function CampaignSummary({ campaignId }: { campaignId: string }) {
  const s = campaignSummary(await getSummaryInput(campaignId));
  const cells: Array<[string, number, string?]> = [
    ["Client billed", s.billedCents, `of ${formatUsd(s.contractCents)}`],
    ["Received", s.receivedCents],
    ["Paid to creators", s.paidOutCents],
    ["Still owed to creators", s.owedCents],
    ["Margin", s.marginCents],
  ];
  return (
    <section aria-label="Campaign summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-zinc-200 bg-zinc-200 sm:grid-cols-5">
      {cells.map(([label, cents, note]) => (
        <div key={label} className="flex flex-col gap-0.5 bg-white px-4 py-3">
          <span className="text-xs text-zinc-500">{label}</span>
          <span className={`text-base font-semibold tabular-nums ${label === "Margin" && cents < 0 ? "text-red-700" : ""}`}>{formatUsd(cents)}</span>
          {note && <span className="text-xs text-zinc-500">{note}</span>}
        </div>
      ))}
    </section>
  );
}
