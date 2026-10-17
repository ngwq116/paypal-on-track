import { checkDeposit, createBalance, sendDeposit } from "@/app/campaigns/[id]/actions";
import ActorSelect from "@/components/ActorSelect";
import AutoRefresh from "@/components/AutoRefresh";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { getClientInvoices } from "@/lib/services/queries";

export default async function DepositPanel({ campaignId }: { campaignId: string }) {
  const invoices = await getClientInvoices(campaignId);
  const deposit = invoices.find((i) => i.kind === "deposit");
  const balance = invoices.find((i) => i.kind === "balance");

  return (
    <section aria-label="Client invoices" className="flex flex-col gap-3">
      {deposit?.status === "paid" && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-3 text-sm text-green-900">
          <strong className="font-semibold">Client deposit received · {formatUsd(deposit.amountCents)}.</strong> Creator payouts on this campaign are unlocked.
        </p>
      )}
      {deposit?.status === "sent" && (
        <form className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm">
          <input type="hidden" name="campaignId" value={campaignId} />
          <AutoRefresh seconds={5} />
          <span role="status">
            <strong className="font-semibold">Deposit {formatUsd(deposit.amountCents)} sent.</strong> Waiting for the client to pay; this updates by itself.
          </span>
          {deposit.paypalViewUrl && (
            <a href={deposit.paypalViewUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open as client (sandbox)
            </a>
          )}
          <span className="flex items-center gap-3">
            <ActorSelect id="check-actor" />
            <button formAction={checkDeposit} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Check payment
            </button>
          </span>
        </form>
      )}
      {(deposit?.status === "draft" || (balance?.status === "draft" && !balance.paypalInvoiceId)) && (
        <form className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 px-3.5 py-3 text-sm">
          <input type="hidden" name="campaignId" value={campaignId} />
          {deposit?.status === "draft" && (
            <span className="text-amber-900">Deposit {formatUsd(deposit.amountCents)} not sent. Creator payouts stay locked until it is paid.</span>
          )}
          <span className="flex-1" />
          <ActorSelect id="invoice-actor" />
          {deposit?.status === "draft" && (
            <button formAction={sendDeposit} className={buttonVariants({ size: "sm" })}>Send deposit invoice</button>
          )}
          {balance?.status === "draft" && !balance.paypalInvoiceId && (
            <button formAction={createBalance} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Create balance draft · due {formatDay(balance.dueDate)}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
