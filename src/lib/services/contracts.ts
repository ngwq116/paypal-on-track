import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { parseContractForm, type ContractForm, type RosterCreator } from "@/lib/domain/contract";
import type { UploadedFile } from "@/lib/domain/upload";
import { isUuid } from "@/lib/uuid";

// R1: the AI's reading is kept as a draft; nothing else exists until a person confirms it.
export async function saveContractDraft(input: { file: UploadedFile; form: ContractForm; model: string; actor: string }): Promise<string> {
  const [row] = await db
    .insert(schema.contracts)
    .values({ fileName: input.file.name, fileType: input.file.type, file: input.file.bytes, extracted: input.form, model: input.model, uploadedBy: input.actor })
    .returning({ id: schema.contracts.id });
  await writeAudit(db, { campaignId: null, actor: input.actor, action: "contract.read", detail: { contractId: row.id, readBy: input.model, creators: input.form.creators.length } });
  return row.id;
}

export async function getContractDraft(contractId: string) {
  if (!isUuid(contractId)) return null;
  const [row] = await db
    .select({
      id: schema.contracts.id,
      fileName: schema.contracts.fileName,
      extracted: schema.contracts.extracted,
      model: schema.contracts.model,
      status: schema.contracts.status,
      campaignId: schema.contracts.campaignId,
      uploadedBy: schema.contracts.uploadedBy,
    })
    .from(schema.contracts)
    .where(eq(schema.contracts.id, contractId));
  return row ?? null;
}

export async function getContractFile(contractId: string) {
  if (!isUuid(contractId)) return null;
  const [row] = await db
    .select({ file: schema.contracts.file, fileType: schema.contracts.fileType, fileName: schema.contracts.fileName })
    .from(schema.contracts)
    .where(eq(schema.contracts.id, contractId));
  return row ?? null;
}

export async function listRoster(): Promise<RosterCreator[]> {
  return db
    .select({ id: schema.creators.id, name: schema.creators.name, type: schema.creators.type, detail: schema.creators.detail, paypalEmail: schema.creators.paypalEmail })
    .from(schema.creators)
    .orderBy(asc(schema.creators.name));
}

// R2–R4: the reviewed terms become a campaign, its assignments and two draft client invoices, in one transaction.
export async function confirmContract(input: {
  contractId: string;
  form: ContractForm;
  actor: string;
}): Promise<{ ok: true; campaignId: string } | { ok: false; errors: string[] }> {
  if (!isUuid(input.contractId)) return { ok: false, errors: ["Contract not found"] };
  return db.transaction(async (tx): Promise<{ ok: true; campaignId: string } | { ok: false; errors: string[] }> => {
    const [contract] = await tx.select().from(schema.contracts).where(eq(schema.contracts.id, input.contractId)).for("update");
    if (!contract) return { ok: false, errors: ["Contract not found"] };
    if (contract.status !== "draft") return { ok: false, errors: ["This contract already created a campaign"] };

    const parsed = parseContractForm(input.form);
    if (!parsed.ok) {
      await tx.update(schema.contracts).set({ extracted: input.form }).where(eq(schema.contracts.id, contract.id)); // keep the edits
      return parsed;
    }
    const t = parsed.terms;

    // An existing client with the same name keeps its record (and its PayPal billing email).
    let [client] = await tx.select().from(schema.clients).where(sql`lower(${schema.clients.name}) = ${t.clientName.toLowerCase()}`).limit(1);
    if (!client) [client] = await tx.insert(schema.clients).values({ name: t.clientName, email: t.clientEmail }).returning();

    const [campaign] = await tx
      .insert(schema.campaigns)
      .values({ clientId: client.id, name: t.campaignName, startDate: t.startDate, endDate: t.endDate, depositCleared: false })
      .returning();

    for (const c of t.creators) {
      let creatorId = c.creatorId && isUuid(c.creatorId) ? c.creatorId : null;
      if (creatorId) {
        const [found] = await tx.select({ id: schema.creators.id }).from(schema.creators).where(eq(schema.creators.id, creatorId));
        creatorId = found?.id ?? null;
      }
      if (!creatorId) {
        const [created] = await tx.insert(schema.creators).values({ name: c.name, type: c.type, detail: c.detail, paypalEmail: c.paypalEmail }).returning({ id: schema.creators.id });
        creatorId = created.id;
      }
      await tx.insert(schema.assignments).values({
        campaignId: campaign.id,
        creatorId,
        deliverable: c.deliverable,
        feeCents: c.feeCents,
        dueDate: c.dueDate,
        payoutDate: c.payoutDate,
        brief: c.brief,
        status: "scheduled",
      });
    }

    await tx.insert(schema.clientInvoices).values([
      { campaignId: campaign.id, kind: "deposit", amountCents: t.depositCents, dueDate: t.depositDueDate, status: "draft" },
      { campaignId: campaign.id, kind: "balance", amountCents: t.balanceCents, dueDate: t.balanceDueDate, status: "draft" },
    ]);
    await tx.update(schema.contracts).set({ status: "confirmed", campaignId: campaign.id, extracted: input.form }).where(eq(schema.contracts.id, contract.id));
    await writeAudit(tx, {
      campaignId: campaign.id,
      actor: input.actor,
      action: "campaign.created",
      detail: {
        contractId: contract.id,
        readBy: contract.model,
        totalCents: t.totalCents,
        creatorCents: t.creators.reduce((s, c) => s + c.feeCents, 0),
        creators: t.creators.length,
      },
    });
    return { ok: true, campaignId: campaign.id };
  });
}
