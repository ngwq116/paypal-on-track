import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import ContractReview from "@/components/ContractReview";
import Notice from "@/components/Notice";
import { getContractDraft, listRoster } from "@/lib/services/contracts";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

export default function ReviewContractPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading contract…</p>}>
        <Review {...props} />
      </Suspense>
    </main>
  );
}

async function Review({ params, searchParams }: Props) {
  const { id } = await params;
  const { notice } = await searchParams;
  const contract = await getContractDraft(id);
  if (!contract) notFound();
  if (contract.status === "confirmed" && contract.campaignId) redirect(`/campaigns/${contract.campaignId}/team`);
  const roster = await listRoster();

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-zinc-500">
        <a href="/" className="hover:text-zinc-950">Campaigns</a>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-950">Review contract</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight">Review contract</h1>
      <p className="text-sm text-zinc-500">
        Read by {contract.model} from {contract.fileName}.{" "}
        <a href={`/api/contracts/${contract.id}/file`} target="_blank" rel="noreferrer" className="text-zinc-700 underline underline-offset-4">
          Open the PDF
        </a>{" "}
        and check every field. Nothing is created until you click Create campaign.
      </p>
      <Notice text={notice} />
      <ContractReview contractId={contract.id} initial={contract.extracted} roster={roster} />
    </>
  );
}
