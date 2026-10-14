import type { PayPalClient } from "./client";
import { toPayPalValue } from "./money";

interface PayoutInput {
  payoutId: string;
  receiverEmail: string;
  amountCents: number;
  note: string;
}

export function buildPayoutBody(input: PayoutInput) {
  return {
    sender_batch_header: { sender_batch_id: input.payoutId, email_subject: "You have a payout from Studio Rakan" },
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
