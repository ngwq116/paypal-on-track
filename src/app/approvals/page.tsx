import { Suspense } from "react";
import { Check, Pencil, RefreshCw, RotateCcw, Send } from "lucide-react";
import Notice from "@/components/Notice";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { listApprovalRows } from "@/lib/services/queries";
import { approveOne, approveSelected, checkStatus, retryFailed, sendNow } from "./actions";

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

type Row = Awaited<ReturnType<typeof listApprovalRows>>[number];
type Kind = "influencer" | "freelancer";

const th = "px-3 py-2.5 font-medium";
const td = "px-3 py-3 align-middle";

async function Queue({ searchParams }: { searchParams: SearchParams }) {
  const { notice } = await searchParams;
  const rows = await listApprovalRows();
  return (
    <div className="flex flex-col gap-8">
      <Notice text={notice} />
      <KindQueue kind="influencer" rows={rows.filter((r) => r.creator.type === "influencer")} />
      <KindQueue kind="freelancer" rows={rows.filter((r) => r.creator.type === "freelancer")} />
      <p className="text-xs text-zinc-500">Edits can lower an amount or move a date, never raise it above the contract. Editing an approved payout sends it back for approval.</p>
    </div>
  );
}

const approvable = (r: Row) => r.payout.status === "awaiting_approval" && r.campaign.depositCleared;

// One form per table: its checkboxes feed its batch button; each row's buttons are bound to their own payout id.
function KindQueue({ kind, rows }: { kind: Kind; rows: Row[] }) {
  const influencer = kind === "influencer";
  const toApprove = rows.filter(approvable).length;
  const id = `${kind}-payouts`;
  return (
    <form aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2.5 text-lg font-semibold">
          <span aria-hidden="true" className={`size-2.5 rounded-[3px] ${influencer ? "bg-violet-300" : "bg-orange-300"}`} />
          {influencer ? "Influencer payouts" : "Freelancer payouts"}
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[13px] font-medium text-zinc-600">
            {toApprove ? `${toApprove} to approve` : `${rows.length} in queue`}
          </span>
        </h2>
        <button formAction={approveSelected} disabled={!toApprove} className={buttonVariants({ size: "lg" })}>
          <Check aria-hidden="true" />
          Approve selected
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-600">
            <tr>
              <th className={`${th} w-8 pl-4`}><span className="sr-only">Select</span></th>
              <th className={th}>{influencer ? "Influencer" : "Freelancer"}</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={th}>{influencer ? "Post check" : "Invoice check"}</th>
              <th className={th}>Client deposit</th>
              <th className={th}>Payout date</th>
              <th className={`${th} pr-4 text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">Nothing here.</td>
              </tr>
            )}
            {rows.map((r) => (
              <QueueRow key={r.payout.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}

function QueueRow({ row: { payout, assignment, creator, campaign, verified } }: { row: Row }) {
  const awaiting = payout.status === "awaiting_approval";
  const locked = awaiting && !campaign.depositCleared;
  const editable = awaiting || payout.status === "scheduled";
  return (
    <tr className={awaiting && !locked ? "bg-amber-50/60" : ""}>
      <td className={`${td} pl-4`}>
        {awaiting && !locked && (
          <input type="checkbox" name="ids" value={payout.id} aria-label={`Select ${creator.name}`} className="size-[18px] accent-zinc-900" />
        )}
      </td>
      <td className={td}>
        <div className="font-medium">{creator.name}</div>
        <div className="text-xs text-zinc-600">{campaign.name} · {creator.detail}</div>
      </td>
      <td className={`${td} text-right tabular-nums`}>
        <div className="font-semibold">{formatUsd(payout.amountCents)}</div>
        <div className="text-xs text-zinc-600">fee {formatUsd(assignment.feeCents)}</div>
      </td>
      <td className={`${td} text-zinc-700`}>{verified}</td>
      <td className={td}>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${campaign.depositCleared ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
          {campaign.depositCleared ? "Received" : "Not received"}
        </span>
      </td>
      <td className={`${td} tabular-nums`}>
        <div>{formatDay(payout.scheduledFor)}</div>
        {payout.status === "scheduled" && <div className="text-xs text-green-800">Approved · sends on this date</div>}
        {payout.status === "payout_failed" && <div className="text-xs font-medium text-red-700">Failed · {payout.statusReason}</div>}
      </td>
      <td className={`${td} pr-4`}>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editable && (
            <a href={`/approvals/${payout.id}`} className={buttonVariants({ variant: "outline" })}>
              <Pencil aria-hidden="true" />
              Edit
            </a>
          )}
          {awaiting && !locked && (
            <button formAction={approveOne.bind(null, payout.id)} className={buttonVariants()}>
              <Check aria-hidden="true" />
              Approve
            </button>
          )}
          {locked && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">Locked · deposit not received</span>}
          {payout.status === "scheduled" && (
            <button formAction={sendNow.bind(null, payout.id)} className={buttonVariants({ variant: "outline", className: "border-zinc-900 font-semibold" })}>
              <Send aria-hidden="true" />
              Send now
            </button>
          )}
          {payout.status === "payout_sent" && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-900">
                <Send className="size-3" aria-hidden="true" />
                Sent · waiting for PayPal
              </span>
              <button formAction={checkStatus.bind(null, payout.id)} className={buttonVariants({ variant: "outline" })}>
                <RefreshCw aria-hidden="true" />
                Check status
              </button>
            </>
          )}
          {payout.status === "payout_failed" && (
            <button formAction={retryFailed.bind(null, payout.id)} className={buttonVariants({ variant: "destructive" })}>
              <RotateCcw aria-hidden="true" />
              Retry payout
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
