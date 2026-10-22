import { checkInvoice, overrideHeldInvoice, readInvoiceWithAi } from "@/app/campaigns/[id]/assignments/[assignmentId]/actions";
import ActorField from "@/components/ActorField";
import FileInput from "@/components/FileInput";
import SubmitButton from "@/components/SubmitButton";
import { buttonVariants } from "@/components/ui/button";
import type { FieldComparison } from "@/lib/domain/invoice-match";
import { formatUsd } from "@/lib/domain/money";
import type { getAssignmentDetail } from "@/lib/services/queries";

type Detail = NonNullable<Awaited<ReturnType<typeof getAssignmentDetail>>>;
const input = "min-h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm font-normal";

export default function InvoiceSection({ detail }: { detail: Detail }) {
  const { assignment, campaign, latest, payout } = detail;
  const fields = latest?.task === "invoice_match" ? ((latest.checks as { fields?: FieldComparison[] }).fields ?? []) : [];
  const held = assignment.status === "held" && latest?.task === "invoice_match" && !latest.pass;
  const done = assignment.status === "verified" || assignment.status === "paid";
  const hidden = (
    <>
      <input type="hidden" name="campaignId" value={campaign.id} />
      <input type="hidden" name="assignmentId" value={assignment.id} />
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {held && (
        <p role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-900">
          <strong className="font-semibold">Payout held.</strong> The invoice doesn&apos;t match the contract. Upload a corrected invoice, or override with a reason.
        </p>
      )}
      {done && (
        <p role="status" className="rounded-[10px] border border-green-200 bg-green-50 px-4 py-3.5 text-sm text-green-900">
          <strong className="font-semibold">{latest?.task === "invoice_override" ? "Override logged." : "Invoice matches."}</strong>{" "}
          {payout ? `A ${formatUsd(payout.amountCents)} payout is ${payout.status === "paid" ? "paid" : "in the approval queue"}.` : ""}
        </p>
      )}

      {fields.length > 0 && (
        <div className="overflow-x-auto rounded-[10px] border border-zinc-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
              <tr>
                <th className="px-4 py-3">Field</th>
                <th className="px-2 py-3">Contract</th>
                <th className="px-2 py-3">Invoice</th>
                <th className="px-4 py-3 text-right">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {fields.map((f) => (
                <tr key={f.field} className={f.ok ? "" : "bg-red-50"}>
                  <td className="px-4 py-3.5 font-medium">{f.label}</td>
                  <td className="px-2 py-3.5 text-zinc-700">{f.contract}</td>
                  <td className={`px-2 py-3.5 ${f.ok ? "text-zinc-700" : "font-semibold text-red-900"}`}>{f.invoice}</td>
                  <td className={`px-4 py-3.5 text-right text-xs font-semibold ${f.ok ? "text-green-700" : "text-red-700"}`}>{f.ok ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {held && (
        <form action={overrideHeldInvoice} className="flex flex-col gap-3 rounded-[10px] border border-zinc-200 p-4">
          {hidden}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Reason (needed to override)
            <textarea name="reason" rows={2} required placeholder="e.g. Client approved an extra revision in writing on Oct 25" className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-normal" />
            <span className="text-xs font-normal text-zinc-500">Pays what was invoiced, capped at the contract fee of {formatUsd(assignment.feeCents)}.</span>
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ActorField />
            <button className={buttonVariants({ variant: "outline" })}>Override with reason</button>
          </div>
        </form>
      )}

      {!done && (
        <form action={checkInvoice} className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 p-4">
          {hidden}
          <h2 className="text-[15px] font-semibold">{fields.length ? "Upload a corrected invoice" : "Check the invoice"}</h2>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Invoice file
            <FileInput name="invoice" accept="application/pdf,image/png,image/jpeg,image/webp" className="text-sm font-normal" />
          </label>
          <p className="text-xs text-zinc-500">
            <strong className="font-medium text-zinc-700">Read with AI</strong> fills the fields from the file and checks them. Or type what the invoice says and click Check typed fields. Either way the comparison is On-Track&apos;s own rules.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">Payee<input name="payee" required className={input} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">PayPal email<input name="paypalEmail" type="email" required className={input} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Deliverable<input name="deliverable" required className={input} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Amount (USD)<input name="amount" inputMode="decimal" placeholder="1,000.00" required className={input} /></label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ActorField />
            <SubmitButton formAction={readInvoiceWithAi} formNoValidate pending="Reading…" className={buttonVariants()}>
              Read with AI
            </SubmitButton>
            <SubmitButton formAction={checkInvoice} pending="Checking…" className={buttonVariants({ variant: "outline" })}>
              Check typed fields
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
