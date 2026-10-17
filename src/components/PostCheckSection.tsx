import { holdPost, verifyPost } from "@/app/campaigns/[id]/assignments/[assignmentId]/actions";
import ActorSelect from "@/components/ActorSelect";
import FileInput from "@/components/FileInput";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { checklistFor } from "@/lib/domain/post-checklist";
import type { getAssignmentDetail } from "@/lib/services/queries";

type Detail = NonNullable<Awaited<ReturnType<typeof getAssignmentDetail>>>;

export default function PostCheckSection({ detail }: { detail: Detail }) {
  const { assignment, campaign, latest, payout } = detail;
  const brief = assignment.brief!;
  const done = assignment.status === "verified" || assignment.status === "paid";

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section aria-label="Proof" className="flex max-w-full flex-[1_1_320px] flex-col gap-3">
        {latest ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from our own route, any size
          <img src={`/api/submissions/${latest.submissionId}/file`} alt={`Latest post screenshot, uploaded by ${latest.submittedBy}`} className="w-full rounded-[10px] border border-zinc-200" />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center rounded-[10px] border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500">No screenshot yet</div>
        )}
        {latest?.link && (
          <a href={latest.link} target="_blank" rel="noreferrer" className="text-sm text-zinc-600 underline-offset-4 hover:underline">Open the post</a>
        )}
      </section>

      <section aria-label="Checklist" className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-zinc-200 bg-zinc-50 p-4">
          <span className="text-xs font-medium text-zinc-500">Brief from contract</span>
          <span className="text-sm">
            {assignment.deliverable} · tag <strong>{brief.brandTag}</strong> · hashtags <strong>{brief.hashtags.join(" ")}</strong> · post between{" "}
            <strong>{formatDay(brief.windowStart)} – {formatDay(brief.windowEnd)}</strong>
          </span>
        </div>

        {done && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-green-200 bg-green-50 px-4 py-3.5 text-sm text-green-900">
            <span>
              <strong className="font-semibold">Post verified.</strong>{" "}
              {payout ? `A ${formatUsd(payout.amountCents)} payout is ${payout.status === "paid" ? "paid" : "in the approval queue"}.` : ""}
            </span>
            <a href="/approvals" className={buttonVariants({ variant: "outline", size: "sm" })}>Open approvals</a>
          </div>
        )}
        {assignment.status === "held" && latest?.note && (
          <p role="status" className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-900">
            <strong className="font-semibold">Held.</strong> {latest.note} No payout is created until a new screenshot passes the checklist.
          </p>
        )}

        {!done && (
          <form className="flex flex-col gap-4">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="assignmentId" value={assignment.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Post screenshot
              <FileInput name="proof" accept="image/png,image/jpeg,image/webp" className="text-sm" />
              <span className="text-xs font-normal text-zinc-500">PNG, JPEG or WebP, up to 4 MB. Sent by the creator, uploaded by you.</span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Post link (optional)
              <input type="url" name="link" placeholder="https://instagram.com/p/…" className="min-h-10 rounded-md border border-zinc-200 px-3 text-sm" />
            </label>
            <fieldset className="rounded-[10px] border border-zinc-200">
              <legend className="sr-only">Checklist</legend>
              {checklistFor(brief).map((item) => (
                <label key={item.id} className="flex cursor-pointer items-start gap-3 border-b border-zinc-100 px-4 py-3.5 last:border-b-0">
                  <input type="checkbox" name="ticked" value={item.id} className="mt-0.5 size-[18px] accent-zinc-900" />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-[13px] text-zinc-500">{item.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Note (needed to hold)
              <textarea name="note" rows={2} placeholder="What's missing? This goes in the audit log." className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ActorSelect />
              <button formAction={holdPost} className={buttonVariants({ variant: "outline" })}>Hold with note</button>
              <button formAction={verifyPost} className={buttonVariants()}>Mark verified</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
