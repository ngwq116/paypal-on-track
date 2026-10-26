import { Suspense } from "react";
import { notFound } from "next/navigation";
import Notice from "@/components/Notice";
import { buttonVariants } from "@/components/ui/button";
import { formatUsd } from "@/lib/domain/money";
import { getPayoutDetail } from "@/lib/services/queries";
import { reject, saveEdit } from "../actions";

type Props = { params: Promise<{ payoutId: string }>; searchParams: Promise<{ notice?: string }> };

export default function ManagePayoutPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading payout…</p>}>
        <Manage {...props} />
      </Suspense>
    </main>
  );
}

const input = "min-h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm";

async function Manage({ params, searchParams }: Props) {
  const { payoutId } = await params;
  const { notice } = await searchParams;
  const row = await getPayoutDetail(payoutId);
  if (!row) notFound();
  const { payout, assignment, creator, campaign } = row;
  const editable = payout.status === "awaiting_approval" || payout.status === "scheduled";

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-zinc-500">
        <a href="/approvals" className="hover:text-zinc-950">Approvals</a>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-950">{creator.name}</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight">Edit payout · {creator.name}</h1>
      <p className="text-sm text-zinc-500">
        {campaign.name} · contract fee {formatUsd(assignment.feeCents)} · {row.verified}
      </p>
      <Notice text={notice} />
      {!editable ? (
        <p className="text-sm text-zinc-600">This payout was already sent, so it can&apos;t be changed.</p>
      ) : (
        <>
          <form action={saveEdit} className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 p-4">
            <input type="hidden" name="payoutId" value={payout.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Amount (USD)
                <input name="amount" defaultValue={(payout.amountCents / 100).toFixed(2)} inputMode="decimal" className={input} required />
                <span className="text-xs font-normal text-zinc-500">You can pay less than {formatUsd(assignment.feeCents)}, not more.</span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Payout date
                <input type="date" name="date" defaultValue={payout.scheduledFor} className={input} required />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Reason
              <textarea name="reason" rows={2} required className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
              <span className="text-xs font-normal text-zinc-500">Required. Saved to the audit log with your name.</span>
            </label>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button className={buttonVariants()}>Save changes</button>
            </div>
          </form>

          <form action={reject} className="flex flex-col gap-3 rounded-[10px] border border-red-200 p-4">
            <input type="hidden" name="payoutId" value={payout.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Reject and hold
              <textarea name="reason" rows={2} required placeholder="Why is this payout held?" className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button className={buttonVariants({ variant: "outline" })}>Reject</button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
