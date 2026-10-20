import { approveBalanceMoveAction } from "@/app/campaigns/[id]/actions";
import ActorSelect from "@/components/ActorSelect";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { getBalanceProposal } from "@/lib/services/balance";

export default async function BalanceProposal({ campaignId, view }: { campaignId: string; view: "team" | "calendar" }) {
  const current = await getBalanceProposal(campaignId);
  if (!current?.proposal || !current.balance) return null;
  const { proposal, balance } = current;
  return (
    <form action={approveBalanceMoveAction} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="newDueDate" value={proposal.newDueDate} />
      <input type="hidden" name="view" value={view} />
      <span className="flex-1">
        <strong className="font-semibold">Move the balance invoice?</strong> {proposal.reason} Push the {formatUsd(balance.amountCents)} balance from{" "}
        {formatDay(balance.dueDate)} to {formatDay(proposal.newDueDate)}
        {balance.paypalInvoiceId ? " (updates the PayPal invoice)" : ""}.
      </span>
      <ActorSelect id={`balance-actor-${view}`} />
      <button className={buttonVariants({ size: "sm" })}>Approve new due date</button>
    </form>
  );
}
