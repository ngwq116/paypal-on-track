import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { agencyToday } from "@/lib/domain/today";
import { payPalFromEnv } from "@/lib/paypal/client";
import { syncSentInvoices } from "@/lib/services/client-invoices";
import { runDuePayouts } from "@/lib/services/payouts";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

// R25: sends approved payouts whose date has arrived. Never approves anything.
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = agencyToday();
  const pp = payPalFromEnv();
  // First settle invoices whose "paid" webhook never arrived, so a cleared deposit doesn't block payouts.
  const invoicesSettled = await syncSentInvoices(pp);
  return NextResponse.json({ today, invoicesSettled, results: await runDuePayouts(pp, today) });
}

// Vercel Cron calls with GET and sends the same "Authorization: Bearer <CRON_SECRET>" header.
export const GET = POST;
