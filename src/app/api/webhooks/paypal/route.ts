import { NextResponse } from "next/server";
import { payPalFromEnv } from "@/lib/paypal/client";
import { interpretEvent, verifyWebhook, type PayPalWebhookEvent } from "@/lib/paypal/webhooks";
import { handlePayPalEvent } from "@/lib/services/webhooks";

export async function POST(req: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return NextResponse.json({ error: "PAYPAL_WEBHOOK_ID is not set" }, { status: 500 });

  const raw = await req.text();
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof event?.id !== "string" || typeof event?.event_type !== "string") {
    return NextResponse.json({ error: "Not a PayPal event" }, { status: 400 });
  }

  // Nothing changes until PayPal confirms it sent this event.
  if (!(await verifyWebhook(payPalFromEnv(), req.headers, raw, webhookId))) {
    return NextResponse.json({ error: "Signature check failed" }, { status: 401 });
  }

  if (process.env.PAYPAL_WEBHOOK_DEBUG === "1") {
    // Ids and statuses only: the raw resource carries payer emails and names.
    console.log("[paypal webhook]", event.id, event.event_type, JSON.stringify(interpretEvent(event)));
  }

  // A thrown error returns 500, the transaction rolls back, and PayPal retries later.
  return NextResponse.json({ outcome: await handlePayPalEvent(event) });
}
