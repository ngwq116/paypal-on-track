import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import FileDrop from "@/components/FileDrop";
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
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-semibold tracking-tight">New campaign from a contract</h1>
        <p className="text-sm text-zinc-600">The AI reads the terms. You check every field before anything is created.</p>
      </div>
      <ol aria-label="Steps" className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-600">
        <li className="flex items-center gap-1.5 font-medium text-zinc-950" aria-current="step">
          <span className="grid size-[22px] place-items-center rounded-full bg-zinc-950 text-xs text-white">1</span>Upload contract
        </li>
        <li aria-hidden="true" className="text-zinc-400">—</li>
        <li className="flex items-center gap-1.5">
          <span className="grid size-[22px] place-items-center rounded-full border border-zinc-300 text-xs">2</span>Check the fields
        </li>
        <li aria-hidden="true" className="text-zinc-400">—</li>
        <li className="flex items-center gap-1.5">
          <span className="grid size-[22px] place-items-center rounded-full border border-zinc-300 text-xs">3</span>Create campaign
        </li>
      </ol>
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
      <form action={uploadContract} className="flex flex-col gap-5">
        <FileDrop name="contract" accept="application/pdf" title="Drop the signed contract here" hint="PDF only, up to 4 MB" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-zinc-600">Reading takes about 10–20 seconds.</span>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/" className={buttonVariants({ variant: "ghost", size: "main" })}>Cancel</a>
            <SubmitButton pending="Reading the contract…" className={buttonVariants({ size: "main" })}>
              <Sparkles aria-hidden="true" />
              Read contract with AI
            </SubmitButton>
          </div>
        </div>
      </form>
    </>
  );
}
