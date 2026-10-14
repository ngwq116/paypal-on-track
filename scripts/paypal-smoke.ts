import { randomUUID } from "node:crypto";
import { payPalFromEnv } from "../src/lib/paypal/client";
import { createInvoice, sendInvoice } from "../src/lib/paypal/invoicing";
import { createPayout } from "../src/lib/paypal/payouts";

async function main() {
  const clientEmail = process.env.SANDBOX_CLIENT_EMAIL;
  const creatorEmail = process.env.SANDBOX_CREATOR_EMAIL;
  if (!clientEmail || !creatorEmail) throw new Error("Set SANDBOX_CLIENT_EMAIL and SANDBOX_CREATOR_EMAIL in .env");

  const pp = payPalFromEnv();
  await pp.getToken();
  console.log("✔ OAuth token received");

  const inv = await createInvoice(pp, {
    invoiceNumber: `OT-SMOKE-${Date.now()}`,
    recipientEmail: clientEmail,
    itemName: "On-Track smoke test deposit",
    amountCents: 100,
    dueDate: "2026-11-20",
  });
  console.log("✔ Invoice created", inv);
  await sendInvoice(pp, inv.id);
  console.log("✔ Invoice sent to", clientEmail);

  const payout = await createPayout(pp, {
    payoutId: `smoke-${randomUUID()}`,
    receiverEmail: creatorEmail,
    amountCents: 100,
    note: "On-Track smoke test payout",
  });
  console.log("✔ Payout created", payout);
}

main().catch((err) => {
  console.error("✘", err);
  process.exit(1);
});
