import { Suspense } from "react";
import ActorField from "@/components/ActorField";
import FileInput from "@/components/FileInput";
import Notice from "@/components/Notice";
import SubmitButton from "@/components/SubmitButton";
import { buttonVariants } from "@/components/ui/button";
import { uploadContract } from "./actions";

type Props = { searchParams: Promise<{ notice?: string }> };

export default function NewCampaignPage({ searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-8 pt-6 pb-12">
      <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-zinc-500">
        <a href="/" className="hover:text-zinc-950">Campaigns</a>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-950">New from contract</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight">New campaign from a contract</h1>
      <p className="text-sm text-zinc-500">
        Upload the signed client contract. The AI reads the terms; you check every field before anything is created.
      </p>
      <Suspense fallback={null}>
        <UploadForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function UploadForm({ searchParams }: Props) {
  const { notice } = await searchParams;
  return (
    <>
      <Notice text={notice} />
      <form action={uploadContract} className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 p-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Signed contract (PDF)
          <FileInput name="contract" accept="application/pdf" className="text-sm font-normal" />
          <span className="text-xs font-normal text-zinc-500">Up to 4 MB. Reading takes about 10–20 seconds.</span>
        </label>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ActorField />
          <SubmitButton pending="Reading the contract…" className={buttonVariants()}>Read contract</SubmitButton>
        </div>
      </form>
    </>
  );
}
