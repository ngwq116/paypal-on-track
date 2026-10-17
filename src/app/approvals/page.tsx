import { Suspense } from "react";
import ActorSelect from "@/components/ActorSelect";
import Notice from "@/components/Notice";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { listApprovalRows } from "@/lib/services/queries";
import { approveOne, approveSelected, sendNow } from "./actions";

type SearchParams = Promise<{ notice?: string }>;

export default function ApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-semibold tracking-tight">Approval queue</h1>
        <p className="text-sm text-zinc-500">
          Every payout needs a person&apos;s approval. Approved payouts are scheduled for their payout date and sent through PayPal on that date.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading payouts…</p>}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const cell = "px-3 py-3 align-middle";

async function Queue({ searchParams }: { searchParams: SearchParams }) {
  const { notice } = await searchParams;
  const rows = await listApprovalRows();
  return (
    // One form: checkboxes feed the batch button; each row's button is bound to its own payout id.
    <form className="flex flex-col gap-4">
      <Notice text={notice} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActorSelect />
        <button formAction={approveSelected} className={buttonVariants({ variant: "default" })}>
          Approve &amp; schedule selected
        </button>
      </div>
      <div className="overflow-x-auto rounded-[10px] border border-zinc-200">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
            <tr>
              <th className={cell}><span className="sr-only">Select</span></th>
              <th className={cell}>Payee</th>
              <th className={cell}>Campaign</th>
              <th className={cell}>Amount</th>
              <th className={cell}>Contract fee</th>
              <th className={cell}>Verified</th>
              <th className={cell}>Client deposit</th>
              <th className={cell}>Payout date</th>
              <th className={cell}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-zinc-500">Nothing to approve.</td>
              </tr>
            )}
            {rows.map(({ payout, assignment, creator, campaign, verified }) => {
              const awaiting = payout.status === "awaiting_approval";
              const locked = awaiting && !campaign.depositCleared;
              return (
                <tr key={payout.id}>
                  <td className={cell}>
                    {awaiting && !locked && (
                      <input type="checkbox" name="ids" value={payout.id} aria-label={`Select ${creator.name}`} className="size-4 accent-zinc-900" />
                    )}
                  </td>
                  <td className={cell}>
                    <div className="font-medium">{creator.name}</div>
                    <div className="text-xs text-zinc-500">{creator.type === "influencer" ? "Influencer" : "Freelancer"} · {creator.detail}</div>
                  </td>
                  <td className={cell}>{campaign.name}</td>
                  <td className={`${cell} tabular-nums font-medium`}>{formatUsd(payout.amountCents)}</td>
                  <td className={`${cell} tabular-nums text-zinc-500`}>{formatUsd(assignment.feeCents)}</td>
                  <td className={cell}>{verified}</td>
                  <td className={cell}>
                    <span
                      className={
                        "rounded-full border px-2 py-0.5 text-xs font-medium " +
                        (campaign.depositCleared ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900")
                      }
                    >
                      {campaign.depositCleared ? "Received" : "Not received"}
                    </span>
                  </td>
                  <td className={`${cell} tabular-nums`}>{formatDay(payout.scheduledFor)}</td>
                  <td className={cell}>
                    <div className="flex flex-wrap items-center gap-2">
                      {awaiting && !locked && (
                        <button formAction={approveOne.bind(null, payout.id)} className={buttonVariants({ size: "sm" })}>
                          Approve
                        </button>
                      )}
                      {locked && <span className="text-xs text-amber-900">Locked until the deposit clears</span>}
                      {payout.status === "scheduled" && (
                        <button formAction={sendNow.bind(null, payout.id)} className={buttonVariants({ size: "sm", variant: "outline" })}>
                          Send now
                        </button>
                      )}
                      {payout.status === "payout_sent" && <span className="text-xs text-zinc-500">Sent via PayPal</span>}
                      {payout.status === "payout_failed" && <span className="text-xs font-medium text-red-700">Failed · {payout.statusReason}</span>}
                      {(awaiting || payout.status === "scheduled") && (
                        <a href={`/approvals/${payout.id}`} className="text-xs text-zinc-600 underline-offset-4 hover:underline">
                          Edit or reject
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">Edits can lower an amount or move a date, never raise it above the contract. Editing an approved payout sends it back for approval.</p>
    </form>
  );
}
