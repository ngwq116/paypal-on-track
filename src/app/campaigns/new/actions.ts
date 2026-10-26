"use server";
import { redirect } from "next/navigation";
import { aiFromEnv } from "@/lib/ai/client";
import { readContract } from "@/lib/ai/contract-reader";
import { AiReadError } from "@/lib/ai/read-file";
import { formFromReading } from "@/lib/domain/contract";
import { checkUpload, CONTRACT_TYPES } from "@/lib/domain/upload";
import { backTo, fileFrom } from "@/lib/form";
import { currentStaff } from "@/lib/staff";
import { listRoster, saveContractDraft } from "@/lib/services/contracts";

const HERE = "/campaigns/new";

// R1: read the signed contract into a draft, then send the person to review it.
export async function uploadContract(form: FormData) {
  const actor = currentStaff();
  const file = await fileFrom(form, "contract");
  if (!file) backTo(HERE, "Upload the signed contract PDF");
  const fileError = checkUpload(file, CONTRACT_TYPES);
  if (fileError) backTo(HERE, fileError);

  let reading: Awaited<ReturnType<typeof readContract>>;
  try {
    reading = await readContract(aiFromEnv(), file);
  } catch (err) {
    console.error("[ai] contract read failed", err);
    backTo(HERE, err instanceof AiReadError ? `${err.message}. Try again, or set AI_MODEL=claude-sonnet-5-5.` : "The AI couldn't be reached. Check ANTHROPIC_API_KEY and try again.");
  }
  const id = await saveContractDraft({ file, form: formFromReading(reading.data, await listRoster()), model: reading.model, actor });
  redirect(`/contracts/${id}`);
}
