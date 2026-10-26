"use server";
import { redirect } from "next/navigation";
import { ContractFormSchema } from "@/lib/domain/contract";
import { backTo, text } from "@/lib/form";
import { currentStaff } from "@/lib/staff";
import { confirmContract } from "@/lib/services/contracts";
import { isUuid } from "@/lib/uuid";

export async function confirmContractAction(form: FormData) {
  const contractId = text(form, "contractId");
  const here = isUuid(contractId) ? `/contracts/${contractId}` : "/";
  let raw: unknown;
  try {
    raw = JSON.parse(text(form, "form"));
  } catch {
    backTo(here, "The form couldn't be read. Reload and try again.");
  }
  const shape = ContractFormSchema.safeParse(raw);
  if (!shape.success) backTo(here, "The form couldn't be read. Reload and try again.");

  const r = await confirmContract({ contractId, form: shape.data, actor: currentStaff() });
  if (!r.ok) backTo(here, r.errors.join(". "));
  redirect(`/campaigns/${r.campaignId}/team?notice=${encodeURIComponent("Campaign created from the contract.")}`);
}
