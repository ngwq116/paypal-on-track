import { askAgent } from "@/app/campaigns/[id]/agent-actions";
import { approveSelected } from "@/app/approvals/actions";
import SubmitButton from "@/components/SubmitButton";
import { buttonVariants } from "@/components/ui/button";
import { formatUsd } from "@/lib/domain/money";
import { previewApprovals } from "@/lib/services/agent";

export default async function AgentPanel({ campaignId, plan, summary }: { campaignId: string; plan?: string; summary?: string }) {
  const rows = plan !== undefined ? await previewApprovals(campaignId, plan.split(",").filter(Boolean)) : null;
  const okCount = rows?.filter((r) => r.check === "ok").length ?? 0;
  return (
    <section id="agent" aria-label="Agent" className="flex flex-col gap-3 rounded-[10px] border border-zinc-200 p-4">
      <form action={askAgent} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="campaignId" value={campaignId} />
        <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-sm font-medium">
          Ask the agent
          <input name="instruction" maxLength={500} required placeholder="e.g. Approve every creator with a verified post" className="min-h-10 rounded-md border border-zinc-200 px-3 text-sm font-normal" />
        </label>
        <SubmitButton pending="Thinking…" className={`${buttonVariants({ variant: "outline" })} self-end`}>Propose</SubmitButton>
      </form>
      <p className="text-xs text-zinc-500">The agent only proposes. Each payout is checked against the contract and the client deposit, and nothing is approved until you click.</p>

      {rows && (
        <form action={approveSelected} className="flex flex-col gap-3">
          {summary && <p className="text-sm text-zinc-700">{summary}</p>}
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">The agent proposed nothing for that instruction.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm">
              {rows.map((r) => (
                <li key={r.payoutId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" name="ids" value={r.payoutId} defaultChecked={r.check === "ok"} disabled={r.check !== "ok"} aria-label={`Approve ${r.payee}`} className="size-4 accent-zinc-900" />
                  <span className="font-medium">{r.payee}</span>
                  <span className="text-zinc-500">{r.deliverable}</span>
                  <span className="tabular-nums">{formatUsd(r.amountCents)}</span>
                  <span className={`ml-auto text-xs font-medium ${r.check === "ok" ? "text-green-700" : "text-red-700"}`}>{r.check === "ok" ? "Guardrail: OK" : r.check}</span>
                </li>
              ))}
            </ul>
          )}
          {okCount > 0 && <SubmitButton pending="Approving…" className={`${buttonVariants()} self-end`}>Approve selected</SubmitButton>}
        </form>
      )}
    </section>
  );
}
