import type { PayPalClient } from "./client";
import { toPayPalValue } from "./money";

interface PayoutInput {
  payoutId: string;
  receiverEmail: string;
  amountCents: number;
  note: string;
  attempt?: number; // 1 unless this is a retry after a failure
}

// PayPal remembers a sender_batch_id and refuses it again, so a retry needs a new one. The item id stays the payout id,
// which is what our webhook matches on.
export const senderBatchId = (payoutId: string, attempt: number): string => (attempt <= 1 ? payoutId : `${payoutId}-${attempt}`);

export function buildPayoutBody(input: PayoutInput) {
  return {
    sender_batch_header: { sender_batch_id: senderBatchId(input.payoutId, input.attempt ?? 1), email_subject: "You have a payout from Studio Rakan" },
    items: [
      {
        recipient_type: "EMAIL" as const,
        amount: { value: toPayPalValue(input.amountCents), currency: "USD" as const },
        receiver: input.receiverEmail,
        note: input.note,
        sender_item_id: input.payoutId,
      },
    ],
  };
}

export async function createPayout(pp: PayPalClient, input: PayoutInput): Promise<{ batchId: string; status: string }> {
  const res = await pp.request<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "POST",
    "/v1/payments/payouts",
    buildPayoutBody(input),
  );
  return { batchId: res.batch_header.payout_batch_id, status: res.batch_header.batch_status };
}

const ITEM_FAILED = new Set(["FAILED", "UNCLAIMED", "BLOCKED", "DENIED", "RETURNED"]);

// The webhook says SUCCEEDED, the batch lookup says SUCCESS. Anything else not listed (PENDING, ONHOLD) is still in flight.
export function payoutItemOutcome(status: string): "paid" | "failed" | null {
  if (status === "SUCCESS" || status === "SUCCEEDED") return "paid";
  return ITEM_FAILED.has(status) ? "failed" : null;
}

// Backup for a missed webhook: look up the batch and find our item (sender_item_id = payout id).
export async function getPayoutItem(pp: PayPalClient, batchId: string, payoutId: string): Promise<{ status: string; errorName: string | null } | null> {
  const res = await pp.request<{
    items?: Array<{ transaction_status?: string; payout_item?: { sender_item_id?: string }; errors?: { name?: string } }>;
  }>("GET", `/v1/payments/payouts/${encodeURIComponent(batchId)}`);
  const item = res.items?.find((i) => i.payout_item?.sender_item_id === payoutId);
  if (!item?.transaction_status) return null;
  return { status: item.transaction_status, errorName: item.errors?.name ?? null };
}
