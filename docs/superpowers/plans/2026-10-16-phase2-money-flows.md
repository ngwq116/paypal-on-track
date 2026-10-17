# On-Track Phase 2: Money Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real money moves end to end in the PayPal sandbox: send the client's deposit invoice, unlock payouts when PayPal's webhook says it was paid, verify an influencer post with a checklist, check a freelancer invoice against the contract, approve payouts in a queue (one by one or in a batch), edit them, send them, and log every step.

**Architecture:** All money rules stay in pure functions in `src/lib/domain/` (unit-tested). A new service layer in `src/lib/services/` does the database work in transactions with row locks, calls the guardrail, and writes the audit log; it is tested against a real Postgres test database. UI mutations are Next.js **Server Actions** that call the services and redirect back with a one-line notice (no client state). PayPal's webhook and the daily payout run are **route handlers**. AI is not used this week: invoice fields are typed in by staff; Phase 3 fills the same fields with Claude.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents` on), TypeScript, Drizzle ORM + postgres-js, PostgreSQL 15 in Docker, Vitest, PayPal REST (sandbox): Invoicing v2, Payouts v1, Webhooks v1, shadcn/ui.

**Spec:** `docs/prd.html` (R5, R6, R7–R12, R15–R17, R21, R25, R26) and `docs/architecture.html` (sections 4 data model, 5 state machines, 6.2–6.3 flows, 8 guardrails, 9 PayPal). UI follows the prototype artboards **Approvals**, **PostCheck** and **Invoice** at https://claude.ai/artifact/MbwdtGAA4WLNMiYMzUpH4z.

**Time budget:** about 9 hours. Estimates are on each task. **If behind, cut in this order:** Task 10 daily run route → batch approve (keep per-row Approve) → balance draft in Task 6 → audit page in Task 10. Never cut the guardrail checks, the row locks, or the webhook.

## Global Constraints

- **Money is integer cents** everywhere. Convert to a PayPal string only with `toPayPalValue()`; parse typed amounts only with `parseUsdToCents()` (Task 2).
- **Calendar dates are `YYYY-MM-DD` strings**, compared as strings. "Today" comes only from `agencyToday()` (Task 1), which uses `Asia/Kuala_Lumpur` (UTC+8).
- **USD only. PayPal sandbox only** (`https://api-m.sandbox.paypal.com`).
- **No payout leaves without `canPay()` returning `allow`.** `canPay()` runs at approval (`approvePayout`) and again inside `sendPayout` right before `createPayout()`. `createPayout()` is called from `sendPayout` only.
- **Every payout needs a person's approval.** No auto-approve anywhere, including the daily run (it only sends payouts that are already `scheduled`, i.e. approved).
- **One payout per assignment** (unique `payouts.assignment_id`). A payout amount never exceeds the contract fee. Edits go through `validatePayoutEdit()`.
- PayPal `sender_batch_id` and `sender_item_id` = our payout row id.
- **Every state change writes an audit event** (`writeAudit`) inside the same transaction, with the person's name (or `paypal` / `daily run`) as actor.
- Uploads: PNG, JPEG, WebP (and PDF for invoices), **max 4 MB**, stored in Postgres `bytea`. Never accept SVG or HTML.
- There is no login yet. The acting person is picked from `STAFF` (`Mei Tan`, `Hana Aziz`) on each form.
- Never commit `.env`. Run `git status` before every commit. `npm test && npm run build` before every commit.

## Review Focus

1. **Double send.** "Send now" clicked twice, or clicked while the daily run sends the same payout → PayPal is called once. Pinned in Task 4: two concurrent `sendPayout` calls → one PayPal request.
2. **Webhook replays and out-of-order events.** PayPal retries the same event, or a `FAILED` arrives after `SUCCEEDED` → processed once, a paid payout stays paid. Pinned in Task 7.
3. **Webhook payload shape differs from our guess.** The invoice id may be at `resource.invoice.id` or `resource.id`; a payout item may lack `sender_item_id` → still matched (falls back to the batch id). Pinned in Task 3 (`interpretEvent`) and Task 7 (batch-id match).
4. **Hostile or oversized uploads.** An SVG or HTML file, a 20 MB photo, a PDF as post proof → rejected with a readable message; a file that lies about its type is served back only under its allow-listed type with `nosniff`, so it can't run as script. Pinned in Task 2 (`checkUpload`) and Task 8 (file route headers).
5. **Late verification and the date line.** A post verified after its contract payout date → payout scheduled for today (Malaysia), never in the past; at 00:30 in Malaysia "today" is already the next day. Pinned in Task 1 (`agencyToday`) and Task 8.

---

## Before you start (about 15 minutes, once)

- [ ] **Postgres running:** `make up`.
- [ ] **Sandbox accounts:** the app's owner account must be a **US business account with a USD balance** (Phase 1 lesson: a MYR-only account fails payouts with `INSUFFICIENT_FUNDS`). In `.env`, `SANDBOX_CLIENT_EMAIL` = a sandbox **personal** account (it pays the invoice), `SANDBOX_CREATOR_EMAIL` = a sandbox **personal** account (it receives payouts; can be the same one).
- [ ] **Tunnel tool for webhooks (Task 7):** `brew install cloudflared`.
- [ ] **`CRON_SECRET`** in `.env`: any long random string, e.g. output of `openssl rand -hex 24`.

---

### Task 0: Close Phase 1 (15 min)

Phase 1's Task 7 checkpoint was never done.

**Files:**
- Modify: `docs/prd.html` (open questions Q1, Q2)
- Modify: `docs/superpowers/plans/2026-10-12-phase1-foundations.md` (add "Phase 1 notes" at the end)

- [ ] **Step 1: Update Q1 and Q2 in `docs/prd.html`**

Q1 → **Answered.** Sandbox business accounts can send payouts and sandbox personal accounts receive them (proven by `npm run paypal:smoke`, batch `9XHJM27W45RQA`). The sending account must hold a **USD balance** (a MYR-only account fails with `INSUFFICIENT_FUNDS`), and turning on an app feature (Invoicing) only applies after the cached access token is revoked or expires (up to 9 hours).

Q2 → **Partly answered.** Bryntum 7.3.7 trial packages install from public npm with no registry login (`@bryntum/scheduler@npm:@bryntum/scheduler-trial`, same for calendar). Still to ask on the PayPal Discord: do trials keep working for judges after 45 days?

- [ ] **Step 2: Add "Phase 1 notes" at the bottom of the Phase 1 plan**

```markdown
## Phase 1 notes

- PayPal: invoice item field is `currency_code` (a typo gave 400 MISSING_REQUIRED_PARAMETER).
- PayPal: payouts draw from the sender's balance in the payout currency; use a US sandbox business account with USD.
- PayPal: dashboard feature toggles need a fresh token. The client now drops its cached token and retries once on a 401.
- Bryntum 7.3.7: CSS is `scheduler.css` + `stockholm-light.css` + Font Awesome (no `scheduler.stockholm.css`). Plan B (one product per route) kept.
- Next 16 with `cacheComponents`: `export const dynamic` is rejected; uncached data must sit inside `<Suspense>`.
- Tailwind's Turbopack CSS rule does not hot-reload `globals.css`; restart `npm run dev` after CSS edits.
- Postgres runs in Docker (`make up`), not Homebrew.
```

- [ ] **Step 3: Commit**

```bash
git add docs
git status   # .env must not be listed
git commit -m "docs: phase 1 checkpoint, answer Q1 and Q2"
```

---

### Task 1: Schema v2, seed scenarios, audit helper, agency "today" (60 min)

**Files:**
- Modify: `src/lib/domain/types.ts` (add `PostBrief`)
- Create: `src/lib/domain/today.ts`, `src/lib/domain/today.test.ts`
- Create: `src/lib/uuid.ts`
- Modify: `src/lib/load-timeline.ts` (use `isUuid`)
- Modify: `src/db/schema.ts` (full replacement below)
- Modify: `src/db/index.ts` (export `Tx`, `DbOrTx`)
- Create: `src/lib/audit.ts`
- Modify: `scripts/seed.ts` (full replacement below)
- Modify: `package.json` (script `db:seed:fresh`), `Makefile` (target `db-fresh`)

**Interfaces:**
- Consumes: existing tables from Phase 1.
- Produces:
  - `type PostBrief = { brandTag: string; hashtags: string[]; windowStart: string; windowEnd: string }` in `src/lib/domain/types.ts`
  - `AGENCY_TZ = "Asia/Kuala_Lumpur"`, `agencyToday(now?: Date): string` in `src/lib/domain/today.ts`
  - `isUuid(s: string): boolean` in `src/lib/uuid.ts`
  - tables `submissions`, `verifications`, `webhookEvents`; new columns `assignments.brief`, `assignments.payoutDate`, `clientInvoices.paypalViewUrl`, `payouts.statusReason`; `payouts.assignmentId` unique
  - `type Tx`, `type DbOrTx` from `@/db`
  - `writeAudit(x: DbOrTx, e: { campaignId: string | null; actor: string; action: string; detail?: Record<string, unknown> }): Promise<void>`
  - `npm run db:seed` (mid-campaign: deposit paid, @aina.eats paid, @jasonlifts verified with a payout awaiting approval) and `npm run db:seed:fresh` (deposit not sent, nothing verified)

- [ ] **Step 1: Write the failing test for `agencyToday`**

Create `src/lib/domain/today.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { agencyToday } from "./today";

describe("agencyToday", () => {
  it("is already the next day at 00:30 in Malaysia", () => {
    expect(agencyToday(new Date("2026-10-26T16:30:00Z"))).toBe("2026-10-27");
  });
  it("is still the same day at 23:59 in Malaysia", () => {
    expect(agencyToday(new Date("2026-10-26T15:59:00Z"))).toBe("2026-10-26");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/domain/today.test.ts`
Expected: FAIL, cannot find module `./today`.

- [ ] **Step 3: Implement**

Create `src/lib/domain/today.ts`:
```ts
export const AGENCY_TZ = "Asia/Kuala_Lumpur";

// The agency's calendar day as YYYY-MM-DD. The only place a Date becomes a calendar day.
export function agencyToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: AGENCY_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
```

Append to `src/lib/domain/types.ts`:
```ts
// The checklist source for an influencer post (R8). Freelancer assignments have no brief.
export interface PostBrief {
    brandTag: string;      // e.g. "@kopikita"
    hashtags: string[];    // e.g. ["#KopiKitaPagi", "#ad"]
    windowStart: string;   // YYYY-MM-DD
    windowEnd: string;     // YYYY-MM-DD
}
```

Create `src/lib/uuid.ts`:
```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres throws on a malformed uuid; check first so bad ids become "not found", not a 500.
export const isUuid = (s: string): boolean => UUID.test(s);
```

In `src/lib/load-timeline.ts`, delete the local `UUID` constant and use the shared helper:
```ts
import { isUuid } from "./uuid";
// ...
  if (!isUuid(campaignId)) return null;
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass (30 old + 2 new).

- [ ] **Step 5: Replace the schema**

Replace `src/db/schema.ts`:
```ts
import { pgTable, pgEnum, uuid, text, integer, boolean, date, timestamp, jsonb, customType } from "drizzle-orm/pg-core";
import type { PostBrief } from "@/lib/domain/types";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const creatorType = pgEnum("creator_type", ["influencer", "freelancer"]);
export const assignmentStatus = pgEnum("assignment_status", ["scheduled", "submitted", "verified", "held", "paid"]);
export const payoutStatus = pgEnum("payout_status", ["awaiting_approval", "scheduled", "payout_sent", "paid", "payout_failed", "held"]);
export const invoiceKind = pgEnum("invoice_kind", ["deposit", "balance"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "sent", "paid"]);
export const submissionKind = pgEnum("submission_kind", ["post_proof", "invoice"]);
export const verificationSource = pgEnum("verification_source", ["user", "ai"]);
export const verificationTask = pgEnum("verification_task", ["post_checklist", "invoice_match", "invoice_override"]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  depositCleared: boolean("deposit_cleared").notNull().default(false),
  currency: text("currency").notNull().default("USD"),
});

export const creators = pgTable("creators", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: creatorType("type").notNull(),
  detail: text("detail").notNull(), // e.g. "Instagram", "Video edits"
  paypalEmail: text("paypal_email").notNull(),
});

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  creatorId: uuid("creator_id").notNull().references(() => creators.id),
  deliverable: text("deliverable").notNull(),
  feeCents: integer("fee_cents").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  payoutDate: date("payout_date", { mode: "string" }).notNull(), // from the contract (R25)
  brief: jsonb("brief").$type<PostBrief>(), // influencers only
  status: assignmentStatus("status").notNull().default("scheduled"),
});

export const clientInvoices = pgTable("client_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  kind: invoiceKind("kind").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  paypalInvoiceId: text("paypal_invoice_id"),
  paypalViewUrl: text("paypal_view_url"), // the payer's link, for opening the invoice as the sandbox client
  status: invoiceStatus("status").notNull().default("draft"),
});

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().unique().references(() => assignments.id), // R16: paid once
  amountCents: integer("amount_cents").notNull(),
  scheduledFor: date("scheduled_for", { mode: "string" }).notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paypalBatchId: text("paypal_batch_id"),
  statusReason: text("status_reason"), // why it is held or failed
  status: payoutStatus("status").notNull().default("awaiting_approval"),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id),
  kind: submissionKind("kind").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  file: bytea("file").notNull(),
  link: text("link"),
  submittedBy: text("submitted_by").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id),
  source: verificationSource("source").notNull(),
  task: verificationTask("task").notNull(),
  pass: boolean("pass").notNull(),
  checks: jsonb("checks").notNull().default({}),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// PayPal event ids already handled; makes the webhook idempotent.
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  actor: text("actor").notNull(), // a person's name, "paypal" or "daily run"
  action: text("action").notNull(),
  detail: jsonb("detail").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
```

Replace `src/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const db = drizzle(postgres(url), { schema });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;
export { schema };
```

Create `src/lib/audit.ts`:
```ts
import { schema, type DbOrTx } from "@/db";

// R21: every approval, payout and invoice change. Call it inside the same transaction as the change.
export async function writeAudit(
  x: DbOrTx,
  e: { campaignId: string | null; actor: string; action: string; detail?: Record<string, unknown> },
): Promise<void> {
  await x.insert(schema.auditEvents).values({ campaignId: e.campaignId, actor: e.actor, action: e.action, detail: e.detail ?? {} });
}
```

- [ ] **Step 6: Replace the seed with two scenarios**

Replace `scripts/seed.ts`:
```ts
import { sql } from "drizzle-orm";
import { db, schema } from "../src/db";

// 1×1 transparent PNG: stands in for post screenshots in seed data.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const brief = (windowStart: string, windowEnd: string) => ({
  brandTag: "@kopikita",
  hashtags: ["#KopiKitaPagi", "#ad"],
  windowStart,
  windowEnd,
});

async function main() {
  // "fresh": deposit not sent, nothing verified (start of the demo). Default: mid-campaign.
  const fresh = process.argv[2] === "fresh";
  const creatorEmail = process.env.SANDBOX_CREATOR_EMAIL ?? "creator@example.com";
  const clientEmail = process.env.SANDBOX_CLIENT_EMAIL ?? "client@example.com";

  await db.execute(
    sql`truncate webhook_events, audit_events, verifications, submissions, payouts, client_invoices, assignments, creators, campaigns, clients restart identity cascade`,
  );

  const [client] = await db.insert(schema.clients).values({ name: "Kopi Kita Sdn Bhd", email: clientEmail }).returning();
  const [campaign] = await db
    .insert(schema.campaigns)
    .values({ clientId: client.id, name: "Kopi Kita · Pagi Launch", startDate: "2026-10-19", endDate: "2026-11-20", depositCleared: !fresh })
    .returning();

  const [aina, jason, mira, daniel] = await db
    .insert(schema.creators)
    .values([
      { name: "@aina.eats", type: "influencer", detail: "Instagram", paypalEmail: creatorEmail },
      { name: "@jasonlifts", type: "influencer", detail: "TikTok", paypalEmail: creatorEmail },
      { name: "@mira.travels", type: "influencer", detail: "Instagram", paypalEmail: creatorEmail },
      { name: "Daniel Lim", type: "freelancer", detail: "Video edits", paypalEmail: creatorEmail },
    ])
    .returning();

  const [aAina, aJason] = await db
    .insert(schema.assignments)
    .values([
      { campaignId: campaign.id, creatorId: aina.id, deliverable: "1 Reel + 2 Stories", feeCents: 150000, dueDate: "2026-10-21", payoutDate: "2026-10-23", brief: brief("2026-10-20", "2026-10-22"), status: fresh ? "scheduled" : "paid" },
      { campaignId: campaign.id, creatorId: jason.id, deliverable: "1 TikTok video", feeCents: 120000, dueDate: "2026-10-24", payoutDate: "2026-10-29", brief: brief("2026-10-23", "2026-10-25"), status: fresh ? "scheduled" : "verified" },
      { campaignId: campaign.id, creatorId: mira.id, deliverable: "1 Reel", feeCents: 200000, dueDate: "2026-10-28", payoutDate: "2026-10-30", brief: brief("2026-10-27", "2026-10-29"), status: "scheduled" },
      { campaignId: campaign.id, creatorId: daniel.id, deliverable: "2 × 30s product video edits", feeCents: 100000, dueDate: "2026-10-27", payoutDate: "2026-10-31", brief: null, status: "scheduled" },
    ])
    .returning();

  await db.insert(schema.clientInvoices).values([
    { campaignId: campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-19", status: fresh ? "draft" : "paid" },
    { campaignId: campaign.id, kind: "balance", amountCents: 600000, dueDate: "2026-11-20", status: "draft" },
  ]);

  if (!fresh) {
    const proofs = await db
      .insert(schema.submissions)
      .values([aAina, aJason].map((a) => ({ assignmentId: a.id, kind: "post_proof" as const, fileName: "seed-placeholder.png", fileType: "image/png", file: PLACEHOLDER_PNG, submittedBy: "Mei Tan" })))
      .returning();
    await db.insert(schema.verifications).values(
      proofs.map((s) => ({ submissionId: s.id, source: "user" as const, task: "post_checklist" as const, pass: true, checks: { ticked: ["brandTag", "hashtags", "window"], missing: [] }, createdBy: "Mei Tan" })),
    );
    await db.insert(schema.payouts).values([
      { assignmentId: aAina.id, amountCents: 150000, scheduledFor: "2026-10-23", approvedBy: "Mei Tan", approvedAt: new Date("2026-10-22T09:00:00+08:00"), status: "paid" },
      { assignmentId: aJason.id, amountCents: 120000, scheduledFor: "2026-10-29", status: "awaiting_approval" },
    ]);
  }

  console.log(`Seeded ${fresh ? "fresh" : "mid-campaign"} campaign ${campaign.id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `package.json` scripts:
```json
"db:seed:fresh": "tsx --env-file=.env scripts/seed.ts fresh"
```

Add to `Makefile` (and add `db-fresh` to the `.PHONY` line):
```make
db-fresh:
	npm run db:seed:fresh
```

- [ ] **Step 7: Rebuild the local database**

New NOT NULL columns can't be added to rows that exist, so wipe and rebuild (seed data only):
Run: `make db-reset`
Expected: `db:push` applies 10 tables and 8 enums; seed prints `Seeded mid-campaign campaign <uuid>`.

Verify: `docker compose exec db psql -U ontrack ontrack -c "select status, amount_cents from payouts"` shows `paid 150000` and `awaiting_approval 120000`.

- [ ] **Step 8: Check the app still renders, then commit**

Run: `npm test && npm run build`, then `npm run dev` and open the Team view: same timeline as before (Daniel is no longer red: he is `scheduled` until his invoice is checked in Task 9).

```bash
git add src scripts package.json Makefile
git status   # .env must not be listed
git commit -m "feat: schema for submissions, verifications, webhooks; seed scenarios"
```

---

### Task 2: Pure rules for checklists, invoices, amounts, uploads (60 min)

**Files:**
- Create: `src/lib/domain/format.ts`, `src/lib/domain/money.ts`, `src/lib/domain/post-checklist.ts`, `src/lib/domain/invoice-match.ts`, `src/lib/domain/upload.ts`
- Test: `src/lib/domain/rules.test.ts`

**Interfaces:**
- Consumes: `PostBrief` (Task 1).
- Produces:
  - `formatDay(day: string): string` → `"Oct 29"`
  - `parseUsdToCents(input: string): number | null`, `formatUsd(cents: number): string` → `"$1,200.00"`
  - `type ChecklistItemId = "brandTag" | "hashtags" | "window"`, `checklistFor(brief: PostBrief): ChecklistItem[]`, `decidePostCheck(input: { brief: PostBrief; ticked: string[]; intent: "verify" | "hold"; note: string }): PostCheckDecision`
  - `compareInvoice(contract: ContractTerms, invoice: InvoiceFields): { match: boolean; fields: FieldComparison[] }`, `payoutAmountFor(feeCents: number, invoicedCents: number): number`
  - `type UploadedFile = { name: string; type: string; size: number; bytes: Buffer }`, `IMAGE_TYPES`, `INVOICE_TYPES`, `MAX_UPLOAD_BYTES`, `checkUpload(file: UploadedFile, allowed: readonly string[]): string | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/rules.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatDay } from "./format";
import { formatUsd, parseUsdToCents } from "./money";
import { checklistFor, decidePostCheck } from "./post-checklist";
import { compareInvoice, payoutAmountFor } from "./invoice-match";
import { checkUpload, IMAGE_TYPES, INVOICE_TYPES } from "./upload";
import type { PostBrief } from "./types";

const brief: PostBrief = { brandTag: "@kopikita", hashtags: ["#KopiKitaPagi", "#ad"], windowStart: "2026-10-30", windowEnd: "2026-11-01" };

describe("formatDay", () => {
  it("formats a calendar day without timezone shifts", () => {
    expect(formatDay("2026-10-29")).toBe("Oct 29");
    expect(formatDay("2026-11-01")).toBe("Nov 1");
  });
});

describe("parseUsdToCents", () => {
  it("accepts what people type", () => {
    expect(parseUsdToCents("1,200.00")).toBe(120000);
    expect(parseUsdToCents("1200")).toBe(120000);
    expect(parseUsdToCents("$1,000.10")).toBe(100010);
    expect(parseUsdToCents(" 0.05 ")).toBe(5);
  });
  it("rejects junk instead of guessing", () => {
    for (const bad of ["", "abc", "-5", "0", "0.00", "12.345", "1,2,00", "1.2.3", "$"]) {
      expect(parseUsdToCents(bad)).toBeNull();
    }
  });
});

describe("formatUsd", () => {
  it("always shows cents", () => {
    expect(formatUsd(120000)).toBe("$1,200.00");
    expect(formatUsd(5)).toBe("$0.05");
  });
});

describe("post checklist", () => {
  it("builds the three items from the brief", () => {
    expect(checklistFor(brief)).toEqual([
      { id: "brandTag", label: "Brand tagged", hint: "@kopikita appears in the caption or on screen" },
      { id: "hashtags", label: "Required hashtags", hint: "#KopiKitaPagi and #ad" },
      { id: "window", label: "Posted inside the window", hint: "Between Oct 30 and Nov 1" },
    ]);
  });
  it("verifies only when every item is ticked", () => {
    expect(decidePostCheck({ brief, ticked: ["brandTag", "hashtags", "window"], intent: "verify", note: "" })).toEqual({
      kind: "verified",
      ticked: ["brandTag", "hashtags", "window"],
    });
    expect(decidePostCheck({ brief, ticked: ["brandTag"], intent: "verify", note: "" })).toEqual({
      kind: "invalid",
      error: "Tick every item to verify. Missing: Required hashtags, Posted inside the window",
    });
  });
  it("holds with a note and lists what is missing; ignores unknown ids", () => {
    expect(decidePostCheck({ brief, ticked: ["brandTag", "bogus"], intent: "hold", note: " No #ad " })).toEqual({
      kind: "held",
      ticked: ["brandTag"],
      missing: ["Required hashtags", "Posted inside the window"],
      note: "No #ad",
    });
  });
  it("needs a note to hold", () => {
    expect(decidePostCheck({ brief, ticked: [], intent: "hold", note: "  " })).toEqual({ kind: "invalid", error: "A note is required to hold" });
  });
});

describe("compareInvoice", () => {
  const contract = { payee: "Daniel Lim", paypalEmail: "daniel@example.com", deliverable: "2 × 30s product video edits", currency: "USD", feeCents: 100000 };
  const invoice = { payee: "  daniel  lim ", paypalEmail: "Daniel@Example.com", deliverable: "2 x 30s product video edits", currency: "usd", amountCents: 100000 };

  it("matches despite spacing, case and × vs x", () => {
    const r = compareInvoice(contract, invoice);
    expect(r.match).toBe(true);
    expect(r.fields.map((f) => f.ok)).toEqual([true, true, true, true, true]);
  });
  it("flags the amount side by side", () => {
    const r = compareInvoice(contract, { ...invoice, amountCents: 120000 });
    expect(r.match).toBe(false);
    expect(r.fields.find((f) => f.field === "amount")).toEqual({ field: "amount", label: "Amount", contract: "$1,000.00", invoice: "$1,200.00", ok: false });
  });
  it("flags a different payee", () => {
    expect(compareInvoice(contract, { ...invoice, payee: "Danny Lee" }).match).toBe(false);
  });
  it("never pays more than the contract or more than was invoiced", () => {
    expect(payoutAmountFor(100000, 120000)).toBe(100000);
    expect(payoutAmountFor(100000, 90000)).toBe(90000);
  });
});

describe("checkUpload", () => {
  const file = (type: string, size = 1000) => ({ name: "x", type, size, bytes: Buffer.alloc(0) });
  it("accepts allowed types under 4 MB", () => {
    expect(checkUpload(file("image/png"), IMAGE_TYPES)).toBeNull();
    expect(checkUpload(file("application/pdf"), INVOICE_TYPES)).toBeNull();
  });
  it("rejects SVG, HTML, PDFs as post proof, empty and oversized files", () => {
    expect(checkUpload(file("image/svg+xml"), IMAGE_TYPES)).toBe("Upload a PNG, JPEG or WebP image");
    expect(checkUpload(file("text/html"), INVOICE_TYPES)).toBe("Upload a PDF, PNG, JPEG or WebP file");
    expect(checkUpload(file("application/pdf"), IMAGE_TYPES)).toBe("Upload a PNG, JPEG or WebP image");
    expect(checkUpload(file("image/png", 0), IMAGE_TYPES)).toBe("The file is empty");
    expect(checkUpload(file("image/png", 20 * 1024 * 1024), IMAGE_TYPES)).toBe("The file is larger than 4 MB");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/domain/rules.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Create `src/lib/domain/format.ts`:
```ts
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-29" → "Oct 29". String parsing only, never a Date.
export function formatDay(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
```

Create `src/lib/domain/money.ts`:
```ts
// "1,200.00", "1200", "$1,000.10" → cents. Anything else (negative, zero, 3 decimals, bad commas) → null.
export function parseUsdToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "");
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function formatUsd(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

Create `src/lib/domain/post-checklist.ts`:
```ts
import { formatDay } from "./format";
import type { PostBrief } from "./types";

export type ChecklistItemId = "brandTag" | "hashtags" | "window";
export interface ChecklistItem { id: ChecklistItemId; label: string; hint: string }

export function checklistFor(brief: PostBrief): ChecklistItem[] {
  return [
    { id: "brandTag", label: "Brand tagged", hint: `${brief.brandTag} appears in the caption or on screen` },
    { id: "hashtags", label: "Required hashtags", hint: brief.hashtags.join(" and ") },
    { id: "window", label: "Posted inside the window", hint: `Between ${formatDay(brief.windowStart)} and ${formatDay(brief.windowEnd)}` },
  ];
}

export type PostCheckDecision =
  | { kind: "verified"; ticked: ChecklistItemId[] }
  | { kind: "held"; ticked: ChecklistItemId[]; missing: string[]; note: string }
  | { kind: "invalid"; error: string };

// R8: all items ticked → verified. "Hold" needs a note saying what is missing.
export function decidePostCheck(input: { brief: PostBrief; ticked: string[]; intent: "verify" | "hold"; note: string }): PostCheckDecision {
  const items = checklistFor(input.brief);
  const ticked = items.filter((i) => input.ticked.includes(i.id)).map((i) => i.id);
  const missing = items.filter((i) => !ticked.includes(i.id)).map((i) => i.label);

  if (input.intent === "verify") {
    if (missing.length) return { kind: "invalid", error: `Tick every item to verify. Missing: ${missing.join(", ")}` };
    return { kind: "verified", ticked };
  }
  const note = input.note.trim();
  if (!note) return { kind: "invalid", error: "A note is required to hold" };
  return { kind: "held", ticked, missing, note };
}
```

Create `src/lib/domain/invoice-match.ts`:
```ts
import { formatUsd } from "./money";

export interface ContractTerms { payee: string; paypalEmail: string; deliverable: string; currency: string; feeCents: number }
export interface InvoiceFields { payee: string; paypalEmail: string; deliverable: string; currency: string; amountCents: number }
export interface FieldComparison {
  field: "payee" | "paypalEmail" | "deliverable" | "currency" | "amount";
  label: string;
  contract: string;
  invoice: string;
  ok: boolean;
}

const norm = (s: string) => s.replace(/×/g, "x").replace(/\s+/g, " ").trim().toLowerCase();

// R11: the comparison is plain code. Whoever (or whatever) read the invoice can't decide the match.
export function compareInvoice(c: ContractTerms, i: InvoiceFields): { match: boolean; fields: FieldComparison[] } {
  const text = (field: FieldComparison["field"], label: string, a: string, b: string): FieldComparison => ({
    field, label, contract: a, invoice: b, ok: norm(a) === norm(b),
  });
  const fields: FieldComparison[] = [
    text("payee", "Payee", c.payee, i.payee),
    text("paypalEmail", "PayPal email", c.paypalEmail, i.paypalEmail),
    text("deliverable", "Deliverable", c.deliverable, i.deliverable),
    text("currency", "Currency", c.currency, i.currency),
    { field: "amount", label: "Amount", contract: formatUsd(c.feeCents), invoice: formatUsd(i.amountCents), ok: i.amountCents === c.feeCents },
  ];
  return { match: fields.every((f) => f.ok), fields };
}

// An override pays what was invoiced, capped at the contract fee (R16). Raising it needs an amended contract.
export const payoutAmountFor = (feeCents: number, invoicedCents: number): number => Math.min(feeCents, invoicedCents);
```

Create `src/lib/domain/upload.ts`:
```ts
export interface UploadedFile { name: string; type: string; size: number; bytes: Buffer }

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const INVOICE_TYPES = ["application/pdf", ...IMAGE_TYPES] as const;

// Allow-list only: these files are served back to the browser later, so SVG/HTML must never get in.
export function checkUpload(file: UploadedFile, allowed: readonly string[]): string | null {
  if (!allowed.includes(file.type)) {
    return allowed.includes("application/pdf") ? "Upload a PDF, PNG, JPEG or WebP file" : "Upload a PNG, JPEG or WebP image";
  }
  if (file.size === 0) return "The file is empty";
  if (file.size > MAX_UPLOAD_BYTES) return "The file is larger than 4 MB";
  return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain
git commit -m "feat: post checklist, invoice match, amount parsing and upload rules"
```

---

### Task 3: PayPal webhook verification and event parsing (45 min)

**Files:**
- Modify: `src/lib/paypal/client.ts` (send a string body as-is)
- Create: `src/lib/paypal/webhooks.ts`
- Modify: `src/lib/paypal/invoicing.ts` (add `invoiceNumberFor`, `getInvoiceViewUrl`)
- Test: `src/lib/paypal/webhooks.test.ts`, `src/lib/paypal/payout.test.ts` (one new test), `src/lib/paypal/invoicing.test.ts` (two new tests)

**Interfaces:**
- Consumes: `PayPalClient` (Phase 1).
- Produces:
  - `buildVerifyBody(headers: { get(name: string): string | null }, rawBody: string, webhookId: string): string | null`
  - `verifyWebhook(pp: PayPalClient, headers: { get(name: string): string | null }, rawBody: string, webhookId: string): Promise<boolean>`
  - `interface PayPalWebhookEvent { id: string; event_type: string; resource?: unknown }`
  - `interpretEvent(e: PayPalWebhookEvent): InterpretedEvent` where `InterpretedEvent = { kind: "invoice_paid"; paypalInvoiceId: string } | { kind: "payout_item"; outcome: "paid" | "failed"; payoutId: string | null; batchId: string | null; status: string } | { kind: "ignored" }`
  - `invoiceNumberFor(campaignId: string, kind: "deposit" | "balance"): string`, `getInvoiceViewUrl(pp: PayPalClient, invoiceId: string): Promise<string | null>`

PayPal's docs don't show the full `resource` of these two events, so `interpretEvent` accepts both likely shapes. Task 7 Step 6 logs a real event so you can confirm.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/paypal/webhooks.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import type { PayPalClient } from "./client";
import { buildVerifyBody, interpretEvent, verifyWebhook } from "./webhooks";

const headers = (over: Record<string, string | null> = {}) => {
  const h: Record<string, string | null> = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
    "paypal-transmission-id": "tid-1",
    "paypal-transmission-sig": "sig==",
    "paypal-transmission-time": "2026-10-27T01:00:00Z",
    ...over,
  };
  return { get: (n: string) => h[n] ?? null };
};

describe("buildVerifyBody", () => {
  it("embeds the event exactly as received (re-serialising can break the signature)", () => {
    const raw = '{"id":"WH-1",  "event_type":"X","resource":{"a":1.0}}';
    const body = buildVerifyBody(headers(), raw, "WEBHOOK-ID")!;
    expect(body.endsWith(`"webhook_event":${raw}}`)).toBe(true);
    expect(JSON.parse(body)).toMatchObject({ webhook_id: "WEBHOOK-ID", transmission_id: "tid-1", auth_algo: "SHA256withRSA" });
  });
  it("returns null when a signature header is missing", () => {
    expect(buildVerifyBody(headers({ "paypal-transmission-sig": null }), "{}", "W")).toBeNull();
  });
});

describe("verifyWebhook", () => {
  it("is true only when PayPal answers SUCCESS", async () => {
    const request = vi.fn().mockResolvedValueOnce({ verification_status: "SUCCESS" }).mockResolvedValueOnce({ verification_status: "FAILURE" });
    const pp = { request } as unknown as PayPalClient;
    expect(await verifyWebhook(pp, headers(), "{}", "W")).toBe(true);
    expect(await verifyWebhook(pp, headers(), "{}", "W")).toBe(false);
    expect(request.mock.calls[0][1]).toBe("/v1/notifications/verify-webhook-signature");
  });
  it("does not call PayPal when headers are missing", async () => {
    const request = vi.fn();
    expect(await verifyWebhook({ request } as unknown as PayPalClient, headers({ "paypal-cert-url": null }), "{}", "W")).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("interpretEvent", () => {
  it("reads the paid invoice id from resource.invoice.id or resource.id", () => {
    expect(interpretEvent({ id: "1", event_type: "INVOICING.INVOICE.PAID", resource: { invoice: { id: "INV2-A" } } })).toEqual({ kind: "invoice_paid", paypalInvoiceId: "INV2-A" });
    expect(interpretEvent({ id: "2", event_type: "INVOICING.INVOICE.PAID", resource: { id: "INV2-B" } })).toEqual({ kind: "invoice_paid", paypalInvoiceId: "INV2-B" });
  });
  it("reads payout items by sender_item_id, with the batch id as fallback", () => {
    expect(
      interpretEvent({ id: "3", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: { payout_batch_id: "B1", payout_item: { sender_item_id: "p-1" } } }),
    ).toEqual({ kind: "payout_item", outcome: "paid", payoutId: "p-1", batchId: "B1", status: "SUCCEEDED" });
    expect(interpretEvent({ id: "4", event_type: "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", resource: { payout_batch_id: "B2" } })).toEqual({
      kind: "payout_item", outcome: "failed", payoutId: null, batchId: "B2", status: "UNCLAIMED",
    });
  });
  it("ignores other events and events it can't match", () => {
    expect(interpretEvent({ id: "5", event_type: "CHECKOUT.ORDER.APPROVED", resource: {} })).toEqual({ kind: "ignored" });
    expect(interpretEvent({ id: "6", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: {} })).toEqual({ kind: "ignored" });
    expect(interpretEvent({ id: "7", event_type: "INVOICING.INVOICE.PAID" })).toEqual({ kind: "ignored" });
  });
});
```

Add to `src/lib/paypal/invoicing.test.ts`:
```ts
import { getInvoiceViewUrl, invoiceNumberFor } from "./invoicing";

describe("invoiceNumberFor", () => {
  it("is stable per campaign and kind, and short enough for PayPal (max 25 chars)", () => {
    const n = invoiceNumberFor("7954c4e7-f9aa-41d5-9c56-c17acb5fc9e3", "deposit");
    expect(n).toBe("OT-7954C4E7-DEP");
    expect(invoiceNumberFor("7954c4e7-f9aa-41d5-9c56-c17acb5fc9e3", "balance")).toBe("OT-7954C4E7-BAL");
    expect(n.length).toBeLessThanOrEqual(25);
  });
});

describe("getInvoiceViewUrl", () => {
  it("returns the payer link from the invoice metadata, or null", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ detail: { metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/#INV2-1" } } })
      .mockResolvedValueOnce({ detail: {} });
    const pp = { request } as unknown as PayPalClient;
    expect(await getInvoiceViewUrl(pp, "INV2-1")).toBe("https://www.sandbox.paypal.com/invoice/p/#INV2-1");
    expect(await getInvoiceViewUrl(pp, "INV2-2")).toBeNull();
  });
});
```

Add to the `createPayPalClient` describe block in `src/lib/paypal/payout.test.ts`:
```ts
  it("sends a string body as-is (webhook verification needs the raw event)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ ok: true }));
    const pp = createPayPalClient(cfg, fetchImpl as unknown as typeof fetch);
    await pp.request("POST", "/x", '{"a":1.0}');
    expect(fetchImpl.mock.calls[1][1].body).toBe('{"a":1.0}');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/paypal`
Expected: FAIL (`./webhooks` missing, new exports missing, string body gets double-encoded as `"{\"a\":1.0}"`).

- [ ] **Step 3: Implement**

In `src/lib/paypal/client.ts`, change the body line inside `request`:
```ts
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
```

Create `src/lib/paypal/webhooks.ts`:
```ts
import type { PayPalClient } from "./client";

const HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

type HeaderBag = { get(name: string): string | null };

export function buildVerifyBody(headers: HeaderBag, rawBody: string, webhookId: string): string | null {
  const fields: Record<string, string> = {};
  for (const [key, header] of Object.entries(HEADERS)) {
    const value = headers.get(header);
    if (!value) return null;
    fields[key] = value;
  }
  fields.webhook_id = webhookId;
  // Embed the event byte-for-byte: parsing and re-stringifying it can change it and fail verification.
  return JSON.stringify(fields).slice(0, -1) + `,"webhook_event":${rawBody}}`;
}

export async function verifyWebhook(pp: PayPalClient, headers: HeaderBag, rawBody: string, webhookId: string): Promise<boolean> {
  const body = buildVerifyBody(headers, rawBody, webhookId);
  if (!body) return false;
  const res = await pp.request<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", body);
  return res.verification_status === "SUCCESS";
}

export interface PayPalWebhookEvent { id: string; event_type: string; resource?: unknown }

export type InterpretedEvent =
  | { kind: "invoice_paid"; paypalInvoiceId: string }
  | { kind: "payout_item"; outcome: "paid" | "failed"; payoutId: string | null; batchId: string | null; status: string }
  | { kind: "ignored" };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const PAYOUT_FAILED = new Set(["FAILED", "UNCLAIMED", "BLOCKED", "DENIED", "RETURNED"]);

export function interpretEvent(e: PayPalWebhookEvent): InterpretedEvent {
  const r = obj(e.resource);

  if (e.event_type === "INVOICING.INVOICE.PAID") {
    const id = str(obj(r.invoice).id) ?? str(r.id);
    return id ? { kind: "invoice_paid", paypalInvoiceId: id } : { kind: "ignored" };
  }

  if (e.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    const status = e.event_type.slice("PAYMENT.PAYOUTS-ITEM.".length);
    if (status !== "SUCCEEDED" && !PAYOUT_FAILED.has(status)) return { kind: "ignored" };
    const payoutId = str(obj(r.payout_item).sender_item_id) ?? str(r.sender_item_id);
    const batchId = str(r.payout_batch_id);
    if (!payoutId && !batchId) return { kind: "ignored" };
    return { kind: "payout_item", outcome: status === "SUCCEEDED" ? "paid" : "failed", payoutId, batchId, status };
  }

  return { kind: "ignored" };
}
```

Add to `src/lib/paypal/invoicing.ts`:
```ts
// Stable per campaign + kind, so PayPal rejects an accidental second invoice (≤ 25 chars).
export function invoiceNumberFor(campaignId: string, kind: "deposit" | "balance"): string {
  return `OT-${campaignId.slice(0, 8).toUpperCase()}-${kind === "deposit" ? "DEP" : "BAL"}`;
}

// The payer's link. In the sandbox, open it logged in as the client's personal test account to pay.
export async function getInvoiceViewUrl(pp: PayPalClient, invoiceId: string): Promise<string | null> {
  const inv = await pp.request<{ detail?: { metadata?: { recipient_view_url?: string } } }>("GET", `/v2/invoicing/invoices/${invoiceId}`);
  return inv.detail?.metadata?.recipient_view_url ?? null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paypal
git commit -m "feat: PayPal webhook signature check and event parsing"
```

---

### Task 4: Payout service with row locks, tested against a real database (90 min)

**Files:**
- Create: `vitest.int.config.ts`
- Modify: `vitest.config.ts` (exclude integration tests)
- Modify: `package.json` (scripts `test:int`, `db:push:test`), `Makefile` (targets `test-db`, `test-int`)
- Create: `src/test/fixtures.ts`
- Create: `src/lib/services/payouts.ts`
- Test: `src/lib/services/payouts.int.test.ts`

**Interfaces:**
- Consumes: `canPay`, `validatePayoutEdit` (Phase 1), `createPayout`, `PayPalError` (Phase 1), `writeAudit`, `Tx`, `isUuid` (Task 1).
- Produces (all in `src/lib/services/payouts.ts`):
  - `type ActionResult = { ok: true } | { ok: false; reason: string }`
  - `latestVerification(x: DbOrTx, assignmentId: string): Promise<{ pass: boolean; source: "user" | "ai" } | null>`
  - `queuePayout(tx: Tx, input: { campaignId: string; assignmentId: string; amountCents: number; payoutDate: string; today: string; actor: string }): Promise<typeof schema.payouts.$inferSelect>`
  - `approvePayout(payoutId: string, actor: string): Promise<ActionResult>`
  - `approvePayouts(ids: string[], actor: string): Promise<Array<{ id: string; result: ActionResult }>>`
  - `rejectPayout(payoutId: string, actor: string, reason: string): Promise<ActionResult>`
  - `sendPayout(pp: PayPalClient, payoutId: string, actor: string): Promise<ActionResult>`
  - `editPayout(input: { payoutId: string; amountCents: number; date: string; reason: string; actor: string; today: string }): Promise<{ ok: true } | { ok: false; errors: string[] }>`
  - `runDuePayouts(pp: PayPalClient, today: string, actor?: string): Promise<Array<{ id: string; result: ActionResult }>>`
- Test helpers in `src/test/fixtures.ts`: `resetDb()`, `seedAssignment(opts)`, `seedPayout(opts)`

- [ ] **Step 1: Create the test database and test config**

```bash
docker compose exec -T db createdb -U ontrack ontrack_test
```

Create `vitest.int.config.ts`:
```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests: real Postgres (database ontrack_test in the Docker container), fake PayPal.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    env: { DATABASE_URL: "postgres://ontrack:ontrack@localhost:5432/ontrack_test" },
    fileParallelism: false, // all files share one database
  },
});
```

In `vitest.config.ts`, add next to `include`:
```ts
            exclude: ["src/**/*.int.test.ts"],
```

Add to `package.json` scripts:
```json
"db:push:test": "DATABASE_URL=postgres://ontrack:ontrack@localhost:5432/ontrack_test drizzle-kit push --force",
"test:int": "vitest run --config vitest.int.config.ts"
```

Add to `Makefile` (and to `.PHONY`):
```make
# Create (if missing) and migrate the integration-test database
test-db:
	docker compose exec -T db createdb -U ontrack ontrack_test 2>/dev/null || true
	npm run db:push:test

test-int: test-db
	npm run test:int
```

Run: `make test-db`
Expected: drizzle-kit applies the schema to `ontrack_test`.

- [ ] **Step 2: Write the fixtures**

Create `src/test/fixtures.ts`:
```ts
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

type PayoutStatus = (typeof schema.payoutStatus.enumValues)[number];
type AssignmentStatus = (typeof schema.assignmentStatus.enumValues)[number];

export async function resetDb() {
  await db.execute(
    sql`truncate webhook_events, audit_events, verifications, submissions, payouts, client_invoices, assignments, creators, campaigns, clients restart identity cascade`,
  );
}

export async function seedAssignment(opts: { type?: "influencer" | "freelancer"; status?: AssignmentStatus; depositCleared?: boolean; payoutDate?: string } = {}) {
  const type = opts.type ?? "influencer";
  const [client] = await db.insert(schema.clients).values({ name: "Client Co", email: "client@example.com" }).returning();
  const [campaign] = await db
    .insert(schema.campaigns)
    .values({ clientId: client.id, name: "Test campaign", startDate: "2026-10-19", endDate: "2026-11-20", depositCleared: opts.depositCleared ?? true })
    .returning();
  const [creator] = await db
    .insert(schema.creators)
    .values(
      type === "influencer"
        ? { name: "@tester", type, detail: "Instagram", paypalEmail: "creator@example.com" }
        : { name: "Daniel Lim", type, detail: "Video edits", paypalEmail: "daniel@example.com" },
    )
    .returning();
  const [assignment] = await db
    .insert(schema.assignments)
    .values({
      campaignId: campaign.id,
      creatorId: creator.id,
      deliverable: type === "influencer" ? "1 Reel" : "2 × 30s product video edits",
      feeCents: type === "influencer" ? 120000 : 100000,
      dueDate: "2026-10-24",
      payoutDate: opts.payoutDate ?? "2026-10-29",
      brief: type === "influencer" ? { brandTag: "@kopikita", hashtags: ["#KopiKitaPagi", "#ad"], windowStart: "2026-10-23", windowEnd: "2026-10-25" } : null,
      status: opts.status ?? "scheduled",
    })
    .returning();
  return { client, campaign, creator, assignment };
}

export async function seedPayout(
  opts: { depositCleared?: boolean; verified?: boolean; status?: PayoutStatus; approvedBy?: string | null; amountCents?: number; paypalBatchId?: string } = {},
) {
  const base = await seedAssignment({ depositCleared: opts.depositCleared, status: "verified" });
  if (opts.verified ?? true) {
    const [s] = await db
      .insert(schema.submissions)
      .values({ assignmentId: base.assignment.id, kind: "post_proof", fileName: "p.png", fileType: "image/png", file: Buffer.from([1]), submittedBy: "Mei Tan" })
      .returning();
    await db.insert(schema.verifications).values({ submissionId: s.id, source: "user", task: "post_checklist", pass: true, createdBy: "Mei Tan" });
  }
  const [payout] = await db
    .insert(schema.payouts)
    .values({
      assignmentId: base.assignment.id,
      amountCents: opts.amountCents ?? 120000,
      scheduledFor: "2026-10-29",
      status: opts.status ?? "awaiting_approval",
      approvedBy: opts.approvedBy ?? null,
      paypalBatchId: opts.paypalBatchId ?? null,
    })
    .returning();
  return { ...base, payout };
}
```

- [ ] **Step 3: Write the failing integration tests**

Create `src/lib/services/payouts.int.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PayPalError, type PayPalClient } from "@/lib/paypal/client";
import { resetDb, seedPayout } from "@/test/fixtures";
import { approvePayout, editPayout, rejectPayout, runDuePayouts, sendPayout } from "./payouts";

function fakePayPal(impl?: (method: string, path: string, body?: unknown) => Promise<unknown>) {
  const request = vi.fn(impl ?? (async () => ({ batch_header: { payout_batch_id: "BATCH-1", batch_status: "PENDING" } })));
  return { pp: { request, getToken: vi.fn() } as unknown as PayPalClient, request };
}
const payoutRow = async (id: string) => (await db.select().from(schema.payouts).where(eq(schema.payouts.id, id)))[0];
const actions = async () => (await db.select().from(schema.auditEvents)).map((a) => a.action);

beforeEach(resetDb);

describe("approvePayout", () => {
  it("schedules a verified payout when the deposit has cleared, and logs who approved it", async () => {
    const { payout } = await seedPayout();
    expect(await approvePayout(payout.id, "Mei Tan")).toEqual({ ok: true });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "scheduled", approvedBy: "Mei Tan" });
    expect(await actions()).toContain("payout.approved");
  });
  it("refuses while the client deposit has not cleared (R15)", async () => {
    const { payout } = await seedPayout({ depositCleared: false });
    expect(await approvePayout(payout.id, "Mei Tan")).toEqual({ ok: false, reason: "Client deposit not received" });
    expect((await payoutRow(payout.id)).status).toBe("awaiting_approval");
  });
  it("refuses work with no passing verification", async () => {
    const { payout } = await seedPayout({ verified: false });
    expect(await approvePayout(payout.id, "Mei Tan")).toEqual({ ok: false, reason: "Work not verified" });
  });
  it("treats a malformed id as not found", async () => {
    expect(await approvePayout("not-a-uuid", "Mei Tan")).toEqual({ ok: false, reason: "Payout not found" });
  });
});

describe("sendPayout", () => {
  it("sends once, with the payout id as sender_batch_id, and stores the batch id", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const { pp, request } = fakePayPal();
    expect(await sendPayout(pp, payout.id, "Mei Tan")).toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(1);
    const body = request.mock.calls[0][2] as { sender_batch_header: { sender_batch_id: string } };
    expect(body.sender_batch_header.sender_batch_id).toBe(payout.id);
    expect(await payoutRow(payout.id)).toMatchObject({ status: "payout_sent", paypalBatchId: "BATCH-1" });
  });
  it("pays only once when Send now is clicked twice at the same moment", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const { pp, request } = fakePayPal();
    const results = await Promise.all([sendPayout(pp, payout.id, "Mei Tan"), sendPayout(pp, payout.id, "Hana Aziz")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, reason: "Already sent" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("re-checks the guardrail at send time: an approved payout is blocked if the deposit flag is off", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan", depositCleared: false });
    const { pp, request } = fakePayPal();
    expect(await sendPayout(pp, payout.id, "Mei Tan")).toEqual({ ok: false, reason: "Client deposit not received" });
    expect(request).not.toHaveBeenCalled();
  });
  it("refuses a payout nobody approved", async () => {
    const { payout } = await seedPayout();
    const { pp, request } = fakePayPal();
    expect(await sendPayout(pp, payout.id, "Mei Tan")).toEqual({ ok: false, reason: "Not approved yet" });
    expect(request).not.toHaveBeenCalled();
  });
  it("marks the payout failed with PayPal's error name when PayPal refuses it (4xx)", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const { pp } = fakePayPal(async () => {
      throw new PayPalError(422, JSON.stringify({ name: "INSUFFICIENT_FUNDS" }));
    });
    expect(await sendPayout(pp, payout.id, "Mei Tan")).toEqual({ ok: false, reason: "PayPal refused the payout: INSUFFICIENT_FUNDS" });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "payout_failed", statusReason: "INSUFFICIENT_FUNDS" });
  });
  it("leaves the payout as sent when PayPal's answer is unknown (5xx); the webhook settles it", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const { pp } = fakePayPal(async () => {
      throw new PayPalError(503, "{}");
    });
    const r = await sendPayout(pp, payout.id, "Mei Tan");
    expect(r.ok).toBe(false);
    expect((await payoutRow(payout.id)).status).toBe("payout_sent");
    expect(await actions()).toContain("payout.unconfirmed");
  });
});

describe("editPayout", () => {
  it("lowering a scheduled payout sends it back for approval and logs before and after", async () => {
    const { payout } = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" });
    const r = await editPayout({ payoutId: payout.id, amountCents: 100000, date: "2026-10-30", reason: "Agreed discount", actor: "Hana Aziz", today: "2026-10-27" });
    expect(r).toEqual({ ok: true });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "awaiting_approval", approvedBy: null, amountCents: 100000, scheduledFor: "2026-10-30" });
    const [audit] = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, "payout.edited"));
    expect(audit.detail).toMatchObject({ reason: "Agreed discount", before: { amountCents: 120000 }, after: { amountCents: 100000 }, approvalReset: true });
  });
  it("rejects raising the amount above the contract fee", async () => {
    const { payout } = await seedPayout();
    expect(await editPayout({ payoutId: payout.id, amountCents: 120001, date: "2026-10-30", reason: "x", actor: "Mei Tan", today: "2026-10-27" })).toEqual({
      ok: false,
      errors: ["Amount is above the contract fee"],
    });
  });
});

describe("rejectPayout", () => {
  it("holds the payout and its assignment, with the reason", async () => {
    const { payout, assignment } = await seedPayout();
    expect(await rejectPayout(payout.id, "Mei Tan", "Wrong product shown")).toEqual({ ok: true });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "held", statusReason: "Wrong product shown" });
    const [a] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, assignment.id));
    expect(a.status).toBe("held");
  });
  it("needs a reason", async () => {
    const { payout } = await seedPayout();
    expect(await rejectPayout(payout.id, "Mei Tan", "  ")).toEqual({ ok: false, reason: "A reason is required" });
  });
});

describe("runDuePayouts", () => {
  it("sends approved payouts whose date has arrived, and nothing else", async () => {
    const due = await seedPayout({ status: "scheduled", approvedBy: "Mei Tan" }); // scheduled for 2026-10-29
    await seedPayout(); // awaiting approval: never sent automatically
    const { pp, request } = fakePayPal();
    expect(await runDuePayouts(pp, "2026-10-28")).toEqual([]);
    expect(await runDuePayouts(pp, "2026-10-29")).toEqual([{ id: due.payout.id, result: { ok: true } }]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npm run test:int`
Expected: FAIL, `./payouts` not found.

- [ ] **Step 5: Implement the service**

Create `src/lib/services/payouts.ts`:
```ts
import { and, desc, eq, lte } from "drizzle-orm";
import { db, schema, type DbOrTx, type Tx } from "@/db";
import { writeAudit } from "@/lib/audit";
import { canPay, validatePayoutEdit } from "@/lib/domain/guardrails";
import { PayPalError, type PayPalClient } from "@/lib/paypal/client";
import { createPayout } from "@/lib/paypal/payouts";
import { isUuid } from "@/lib/uuid";

export type ActionResult = { ok: true } | { ok: false; reason: string };

const NOT_FOUND = { ok: false, reason: "Payout not found" } as const;

export async function latestVerification(x: DbOrTx, assignmentId: string) {
  const [row] = await x
    .select({ pass: schema.verifications.pass, source: schema.verifications.source })
    .from(schema.verifications)
    .innerJoin(schema.submissions, eq(schema.submissions.id, schema.verifications.submissionId))
    .where(eq(schema.submissions.assignmentId, assignmentId))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);
  return row ?? null;
}

// Locks the payout and its assignment row until the transaction ends, so two clicks can't both pass the checks.
async function lockPayout(tx: Tx, payoutId: string) {
  const [row] = await tx
    .select({ payout: schema.payouts, assignment: schema.assignments, campaign: schema.campaigns, creator: schema.creators })
    .from(schema.payouts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.payouts.assignmentId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId))
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .where(eq(schema.payouts.id, payoutId))
    .for("update");
  if (!row) return null;
  const verification = await latestVerification(tx, row.assignment.id);
  const decision = canPay({ campaign: row.campaign, assignment: row.assignment, verification, payout: row.payout });
  return { ...row, decision };
}

// R9 / R12: a verified post or a matching invoice queues a payout for approval. One payout per assignment (R16).
export async function queuePayout(
  tx: Tx,
  input: { campaignId: string; assignmentId: string; amountCents: number; payoutDate: string; today: string; actor: string },
) {
  const [existing] = await tx.select().from(schema.payouts).where(eq(schema.payouts.assignmentId, input.assignmentId)).for("update");
  if (existing && existing.status !== "held") return existing;

  const values = {
    amountCents: input.amountCents,
    scheduledFor: input.payoutDate < input.today ? input.today : input.payoutDate, // never in the past
    status: "awaiting_approval" as const,
    approvedBy: null,
    approvedAt: null,
    statusReason: null,
  };
  const [payout] = existing
    ? await tx.update(schema.payouts).set(values).where(eq(schema.payouts.id, existing.id)).returning()
    : await tx.insert(schema.payouts).values({ assignmentId: input.assignmentId, ...values }).returning();

  await writeAudit(tx, {
    campaignId: input.campaignId,
    actor: input.actor,
    action: "payout.queued",
    detail: { payoutId: payout.id, amountCents: payout.amountCents, scheduledFor: payout.scheduledFor },
  });
  return payout;
}

export async function approvePayout(payoutId: string, actor: string): Promise<ActionResult> {
  if (!isUuid(payoutId)) return NOT_FOUND;
  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockPayout(tx, payoutId);
    if (!row) return NOT_FOUND;
    if (row.payout.status !== "awaiting_approval") return { ok: false, reason: "Not waiting for approval" };
    if (row.decision.kind === "deny") return { ok: false, reason: row.decision.reason }; // canPay at approval

    await tx.update(schema.payouts).set({ status: "scheduled", approvedBy: actor, approvedAt: new Date() }).where(eq(schema.payouts.id, payoutId));
    await writeAudit(tx, {
      campaignId: row.campaign.id,
      actor,
      action: "payout.approved",
      detail: { payoutId, amountCents: row.payout.amountCents, scheduledFor: row.payout.scheduledFor },
    });
    return { ok: true };
  });
}

export async function approvePayouts(ids: string[], actor: string) {
  const out: Array<{ id: string; result: ActionResult }> = [];
  for (const id of ids) out.push({ id, result: await approvePayout(id, actor) }); // one transaction each
  return out;
}

export async function rejectPayout(payoutId: string, actor: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, reason: "A reason is required" };
  if (!isUuid(payoutId)) return NOT_FOUND;
  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockPayout(tx, payoutId);
    if (!row) return NOT_FOUND;
    if (row.payout.status !== "awaiting_approval" && row.payout.status !== "scheduled") {
      return { ok: false, reason: "Only a payout that hasn't been sent can be rejected" };
    }
    await tx
      .update(schema.payouts)
      .set({ status: "held", statusReason: reason.trim(), approvedBy: null, approvedAt: null })
      .where(eq(schema.payouts.id, payoutId));
    await tx.update(schema.assignments).set({ status: "held" }).where(eq(schema.assignments.id, row.assignment.id));
    await writeAudit(tx, { campaignId: row.campaign.id, actor, action: "payout.rejected", detail: { payoutId, reason: reason.trim() } });
    return { ok: true };
  });
}

function payPalErrorName(err: PayPalError): string {
  try {
    const name = (JSON.parse(err.body) as { name?: unknown }).name;
    return typeof name === "string" ? name : `HTTP ${err.status}`;
  } catch {
    return `HTTP ${err.status}`;
  }
}

// The only caller of createPayout().
export async function sendPayout(pp: PayPalClient, payoutId: string, actor: string): Promise<ActionResult> {
  if (!isUuid(payoutId)) return NOT_FOUND;

  // 1. Claim it under a row lock: a second click (or the daily run) waits here, then sees payout_sent and stops.
  const claim = await db.transaction(async (tx) => {
    const row = await lockPayout(tx, payoutId);
    if (!row) return NOT_FOUND;
    const { status } = row.payout;
    if (status === "payout_sent" || status === "paid") return { ok: false as const, reason: "Already sent" };
    if (status !== "scheduled") return { ok: false as const, reason: "Not approved yet" };
    if (row.decision.kind !== "allow") return { ok: false as const, reason: row.decision.reason }; // canPay right before createPayout

    await tx.update(schema.payouts).set({ status: "payout_sent", statusReason: null }).where(eq(schema.payouts.id, payoutId));
    await writeAudit(tx, { campaignId: row.campaign.id, actor, action: "payout.sending", detail: { payoutId, amountCents: row.payout.amountCents } });
    return { ok: true as const, row };
  });
  if (!claim.ok) return claim;

  // 2. Call PayPal outside the transaction. sender_batch_id = payout id, so a retry can't pay twice.
  const { payout, campaign, creator, assignment } = claim.row;
  try {
    const res = await createPayout(pp, {
      payoutId: payout.id,
      receiverEmail: creator.paypalEmail,
      amountCents: payout.amountCents,
      note: `${campaign.name} · ${assignment.deliverable}`,
    });
    await db.update(schema.payouts).set({ paypalBatchId: res.batchId }).where(eq(schema.payouts.id, payout.id));
    await writeAudit(db, { campaignId: campaign.id, actor, action: "payout.sent", detail: { payoutId: payout.id, batchId: res.batchId, batchStatus: res.status } });
    return { ok: true };
  } catch (err) {
    if (err instanceof PayPalError && err.status >= 400 && err.status < 500) {
      const name = payPalErrorName(err);
      await db.update(schema.payouts).set({ status: "payout_failed", statusReason: name }).where(eq(schema.payouts.id, payout.id));
      await writeAudit(db, { campaignId: campaign.id, actor, action: "payout.failed", detail: { payoutId: payout.id, httpStatus: err.status, name } });
      return { ok: false, reason: `PayPal refused the payout: ${name}` };
    }
    // Timeout or 5xx: PayPal may have created the batch. Keep payout_sent; the webhook settles it.
    await writeAudit(db, { campaignId: campaign.id, actor, action: "payout.unconfirmed", detail: { payoutId: payout.id, error: String(err) } });
    return { ok: false, reason: "PayPal did not confirm the payout. Its status will update when PayPal's webhook arrives." };
  }
}

export async function editPayout(input: {
  payoutId: string;
  amountCents: number;
  date: string;
  reason: string;
  actor: string;
  today: string;
}): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  if (!isUuid(input.payoutId)) return { ok: false, errors: ["Payout not found"] };
  return db.transaction(async (tx): Promise<{ ok: true } | { ok: false; errors: string[] }> => {
    const row = await lockPayout(tx, input.payoutId);
    if (!row) return { ok: false, errors: ["Payout not found"] };
    const result = validatePayoutEdit({
      payout: row.payout,
      assignment: row.assignment,
      newAmountCents: input.amountCents,
      newDate: input.date,
      reason: input.reason,
      today: input.today,
    });
    if (!result.ok) return result;

    const after = {
      amountCents: input.amountCents,
      scheduledFor: input.date,
      ...(result.resetApproval ? { status: "awaiting_approval" as const, approvedBy: null, approvedAt: null } : {}),
    };
    await tx.update(schema.payouts).set(after).where(eq(schema.payouts.id, input.payoutId));
    await writeAudit(tx, {
      campaignId: row.campaign.id,
      actor: input.actor,
      action: "payout.edited",
      detail: {
        payoutId: input.payoutId,
        reason: input.reason.trim(),
        before: { amountCents: row.payout.amountCents, scheduledFor: row.payout.scheduledFor, status: row.payout.status },
        after: { amountCents: input.amountCents, scheduledFor: input.date },
        approvalReset: result.resetApproval,
      },
    });
    return { ok: true };
  });
}

// R25: send approved payouts whose date has arrived. Only "scheduled" (already approved) payouts are touched.
export async function runDuePayouts(pp: PayPalClient, today: string, actor = "daily run") {
  const due = await db
    .select({ id: schema.payouts.id })
    .from(schema.payouts)
    .where(and(eq(schema.payouts.status, "scheduled"), lte(schema.payouts.scheduledFor, today)));
  const out: Array<{ id: string; result: ActionResult }> = [];
  for (const { id } of due) out.push({ id, result: await sendPayout(pp, id, actor) });
  return out;
}
```

- [ ] **Step 6: Run the tests**

Run: `npm run test:int`
Expected: all pass. If the "twice at the same moment" test is flaky, the lock is missing: check `.for("update")` in `lockPayout`.

Run: `npm test && npm run build`
Expected: pass (unit tests don't pick up `*.int.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts vitest.int.config.ts package.json Makefile src/test src/lib/services
git status
git commit -m "feat: payout service with row locks: approve, reject, send, edit, run due"
```

---

### Task 5: Approval queue page (60 min)

Follows the prototype's **Approvals** artboard: one table with Payee, Campaign, Amount, Contract fee, Verified, Client deposit, Payout date, Action; checkboxes for a batch; payouts on a campaign without a cleared deposit show as **Locked**. Editing and rejecting happen on a small "Manage" page (no dialogs, no client state).

**Files:**
- Create: `src/lib/staff.ts`, `src/lib/form.ts`
- Create: `src/lib/services/queries.ts`
- Create: `src/components/Notice.tsx`, `src/components/ActorSelect.tsx`
- Create: `src/app/approvals/page.tsx`, `src/app/approvals/actions.ts`
- Create: `src/app/approvals/[payoutId]/page.tsx`
- Modify: `src/app/layout.tsx` (top navigation)

**Interfaces:**
- Consumes: `approvePayouts`, `sendPayout`, `rejectPayout`, `editPayout` (Task 4); `formatDay`, `formatUsd`, `parseUsdToCents`, `agencyToday` (Tasks 1–2).
- Produces:
  - `STAFF`, `isStaff(name: string): boolean` in `src/lib/staff.ts`
  - `actorFrom(form: FormData): string`, `text(form: FormData, key: string): string`, `backTo(path: string, notice: string): never`, `fileFrom(form: FormData, key: string): Promise<UploadedFile | null>` in `src/lib/form.ts`
  - `listApprovalRows()`, `getPayoutDetail(payoutId: string)`, `verificationLabel(assignmentId: string)` in `src/lib/services/queries.ts`
  - `<Notice text?>`, `<ActorSelect>` components
  - route `/approvals`, `/approvals/[payoutId]`

- [ ] **Step 1: Shared helpers**

Create `src/lib/staff.ts`:
```ts
// No login yet: the acting person is picked on each form. Only these names can approve (R17).
export const STAFF = ["Mei Tan", "Hana Aziz"] as const;
export const isStaff = (name: string): boolean => (STAFF as readonly string[]).includes(name);
```

Create `src/lib/form.ts`:
```ts
import { redirect } from "next/navigation";
import type { UploadedFile } from "@/lib/domain/upload";
import { isStaff } from "@/lib/staff";

export const text = (form: FormData, key: string): string => String(form.get(key) ?? "");

export function actorFrom(form: FormData): string {
  const actor = text(form, "actor");
  if (!isStaff(actor)) throw new Error("Unknown staff member");
  return actor;
}

// Back to the page with a one-line notice (shown by <Notice>). Always a local path.
export function backTo(path: string, notice: string): never {
  redirect(`${path.startsWith("/") ? path : "/"}?notice=${encodeURIComponent(notice)}`);
}

export async function fileFrom(form: FormData, key: string): Promise<UploadedFile | null> {
  const f = form.get(key);
  if (!(f instanceof File) || f.size === 0) return null;
  return { name: f.name, type: f.type, size: f.size, bytes: Buffer.from(await f.arrayBuffer()) };
}
```

Create `src/components/Notice.tsx`:
```tsx
export default function Notice({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p role="status" className="rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-700">
      {text}
    </p>
  );
}
```

Create `src/components/ActorSelect.tsx`:
```tsx
import { STAFF } from "@/lib/staff";

export default function ActorSelect({ id = "actor" }: { id?: string }) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-zinc-600">
      Acting as
      <select id={id} name="actor" defaultValue={STAFF[0]} className="min-h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-950">
        {STAFF.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 2: Read queries**

Create `src/lib/services/queries.ts`:
```ts
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/uuid";

const TASK_LABEL = { post_checklist: "Post checklist", invoice_match: "Invoice matches", invoice_override: "Invoice override" } as const;

export async function verificationLabel(assignmentId: string): Promise<string> {
  const [v] = await db
    .select({ task: schema.verifications.task, pass: schema.verifications.pass, createdBy: schema.verifications.createdBy })
    .from(schema.verifications)
    .innerJoin(schema.submissions, eq(schema.submissions.id, schema.verifications.submissionId))
    .where(eq(schema.submissions.assignmentId, assignmentId))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);
  return v?.pass ? `${TASK_LABEL[v.task]} · ${v.createdBy}` : "Not verified";
}

const payoutWithContext = () =>
  db
    .select({ payout: schema.payouts, assignment: schema.assignments, creator: schema.creators, campaign: schema.campaigns })
    .from(schema.payouts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.payouts.assignmentId))
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId));

export async function listApprovalRows() {
  const rows = await payoutWithContext()
    .where(inArray(schema.payouts.status, ["awaiting_approval", "scheduled", "payout_sent", "payout_failed"]))
    .orderBy(asc(schema.payouts.scheduledFor));
  return Promise.all(rows.map(async (r) => ({ ...r, verified: await verificationLabel(r.assignment.id) })));
}

export async function getPayoutDetail(payoutId: string) {
  if (!isUuid(payoutId)) return null;
  const [row] = await payoutWithContext().where(eq(schema.payouts.id, payoutId));
  return row ? { ...row, verified: await verificationLabel(row.assignment.id) } : null;
}
```

- [ ] **Step 3: Server Actions**

Create `src/app/approvals/actions.ts`:
```ts
"use server";
import { agencyToday } from "@/lib/domain/today";
import { parseUsdToCents } from "@/lib/domain/money";
import { actorFrom, backTo, text } from "@/lib/form";
import { payPalFromEnv } from "@/lib/paypal/client";
import { approvePayouts, editPayout, rejectPayout, sendPayout, type ActionResult } from "@/lib/services/payouts";

function summarize(results: Array<{ result: ActionResult }>): string {
  const done = results.filter((r) => r.result.ok).length;
  const reasons = [...new Set(results.flatMap((r) => (r.result.ok ? [] : [r.result.reason])))];
  return reasons.length ? `${done} approved · ${results.length - done} not approved (${reasons.join("; ")})` : `${done} approved and scheduled`;
}

export async function approveSelected(form: FormData) {
  const ids = form.getAll("ids").map(String);
  if (!ids.length) backTo("/approvals", "Select at least one payout");
  backTo("/approvals", summarize(await approvePayouts(ids, actorFrom(form))));
}

export async function approveOne(form: FormData) {
  backTo("/approvals", summarize(await approvePayouts([text(form, "payoutId")], actorFrom(form))));
}

export async function sendNow(form: FormData) {
  const r = await sendPayout(payPalFromEnv(), text(form, "payoutId"), actorFrom(form));
  backTo("/approvals", r.ok ? "Sent to PayPal. It turns paid when PayPal confirms." : r.reason);
}

export async function saveEdit(form: FormData) {
  const payoutId = text(form, "payoutId");
  const here = `/approvals/${payoutId}`;
  const amountCents = parseUsdToCents(text(form, "amount"));
  if (amountCents === null) backTo(here, "Enter the amount like 1,200.00");
  const r = await editPayout({ payoutId, amountCents, date: text(form, "date"), reason: text(form, "reason"), actor: actorFrom(form), today: agencyToday() });
  if (!r.ok) backTo(here, r.errors.join(". "));
  backTo("/approvals", "Payout updated. Edited payouts need approval again.");
}

export async function reject(form: FormData) {
  const payoutId = text(form, "payoutId");
  const r = await rejectPayout(payoutId, actorFrom(form), text(form, "reason"));
  if (!r.ok) backTo(`/approvals/${payoutId}`, r.reason);
  backTo("/approvals", "Payout rejected and held. The reason is in the audit log.");
}
```

- [ ] **Step 4: The queue page**

Create `src/app/approvals/page.tsx`:
```tsx
import { Suspense } from "react";
import ActorSelect from "@/components/ActorSelect";
import Notice from "@/components/Notice";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { listApprovalRows } from "@/lib/services/queries";
import { approveOne, approveSelected, sendNow } from "./actions";

type SearchParams = Promise<{ notice?: string }>;

export default function ApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-semibold tracking-tight">Approval queue</h1>
        <p className="text-sm text-zinc-500">
          Every payout needs a person&apos;s approval. Approved payouts are scheduled for their payout date and sent through PayPal on that date.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading payouts…</p>}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const cell = "px-3 py-3 align-middle";

async function Queue({ searchParams }: { searchParams: SearchParams }) {
  const { notice } = await searchParams;
  const rows = await listApprovalRows();
  return (
    // One form: checkboxes feed the batch button; each row's button posts its own payoutId.
    <form className="flex flex-col gap-4">
      <Notice text={notice} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActorSelect />
        <button formAction={approveSelected} className={buttonVariants({ variant: "default" })}>
          Approve &amp; schedule selected
        </button>
      </div>
      <div className="overflow-x-auto rounded-[10px] border border-zinc-200">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
            <tr>
              <th className={cell}><span className="sr-only">Select</span></th>
              <th className={cell}>Payee</th>
              <th className={cell}>Campaign</th>
              <th className={cell}>Amount</th>
              <th className={cell}>Contract fee</th>
              <th className={cell}>Verified</th>
              <th className={cell}>Client deposit</th>
              <th className={cell}>Payout date</th>
              <th className={cell}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-zinc-500">Nothing to approve.</td>
              </tr>
            )}
            {rows.map(({ payout, assignment, creator, campaign, verified }) => {
              const awaiting = payout.status === "awaiting_approval";
              const locked = awaiting && !campaign.depositCleared;
              return (
                <tr key={payout.id}>
                  <td className={cell}>
                    {awaiting && !locked && (
                      <input type="checkbox" name="ids" value={payout.id} aria-label={`Select ${creator.name}`} className="size-4 accent-zinc-900" />
                    )}
                  </td>
                  <td className={cell}>
                    <div className="font-medium">{creator.name}</div>
                    <div className="text-xs text-zinc-500">{creator.type === "influencer" ? "Influencer" : "Freelancer"} · {creator.detail}</div>
                  </td>
                  <td className={cell}>{campaign.name}</td>
                  <td className={`${cell} tabular-nums font-medium`}>{formatUsd(payout.amountCents)}</td>
                  <td className={`${cell} tabular-nums text-zinc-500`}>{formatUsd(assignment.feeCents)}</td>
                  <td className={cell}>{verified}</td>
                  <td className={cell}>
                    <span
                      className={
                        "rounded-full border px-2 py-0.5 text-xs font-medium " +
                        (campaign.depositCleared ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900")
                      }
                    >
                      {campaign.depositCleared ? "Received" : "Not received"}
                    </span>
                  </td>
                  <td className={`${cell} tabular-nums`}>{formatDay(payout.scheduledFor)}</td>
                  <td className={cell}>
                    <div className="flex flex-wrap items-center gap-2">
                      {awaiting && !locked && (
                        <button formAction={approveOne} name="payoutId" value={payout.id} className={buttonVariants({ size: "sm" })}>
                          Approve
                        </button>
                      )}
                      {locked && <span className="text-xs text-amber-900">Locked until the deposit clears</span>}
                      {payout.status === "scheduled" && (
                        <button formAction={sendNow} name="payoutId" value={payout.id} className={buttonVariants({ size: "sm", variant: "outline" })}>
                          Send now
                        </button>
                      )}
                      {payout.status === "payout_sent" && <span className="text-xs text-zinc-500">Sent via PayPal</span>}
                      {payout.status === "payout_failed" && <span className="text-xs font-medium text-red-700">Failed · {payout.statusReason}</span>}
                      {(awaiting || payout.status === "scheduled") && (
                        <a href={`/approvals/${payout.id}`} className="text-xs text-zinc-600 underline-offset-4 hover:underline">
                          Edit or reject
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">Edits can lower an amount or move a date, never raise it above the contract. Editing an approved payout sends it back for approval.</p>
    </form>
  );
}
```

- [ ] **Step 5: The manage page (edit, reject)**

Create `src/app/approvals/[payoutId]/page.tsx`:
```tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import ActorSelect from "@/components/ActorSelect";
import Notice from "@/components/Notice";
import { buttonVariants } from "@/components/ui/button";
import { formatUsd } from "@/lib/domain/money";
import { getPayoutDetail } from "@/lib/services/queries";
import { reject, saveEdit } from "../actions";

type Props = { params: Promise<{ payoutId: string }>; searchParams: Promise<{ notice?: string }> };

export default function ManagePayoutPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading payout…</p>}>
        <Manage {...props} />
      </Suspense>
    </main>
  );
}

const input = "min-h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm";

async function Manage({ params, searchParams }: Props) {
  const { payoutId } = await params;
  const { notice } = await searchParams;
  const row = await getPayoutDetail(payoutId);
  if (!row) notFound();
  const { payout, assignment, creator, campaign } = row;
  const editable = payout.status === "awaiting_approval" || payout.status === "scheduled";

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-zinc-500">
        <a href="/approvals" className="hover:text-zinc-950">Approvals</a>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-950">{creator.name}</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight">Edit payout · {creator.name}</h1>
      <p className="text-sm text-zinc-500">
        {campaign.name} · contract fee {formatUsd(assignment.feeCents)} · {row.verified}
      </p>
      <Notice text={notice} />
      {!editable ? (
        <p className="text-sm text-zinc-600">This payout was already sent, so it can&apos;t be changed.</p>
      ) : (
        <>
          <form action={saveEdit} className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 p-4">
            <input type="hidden" name="payoutId" value={payout.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Amount (USD)
                <input name="amount" defaultValue={(payout.amountCents / 100).toFixed(2)} inputMode="decimal" className={input} required />
                <span className="text-xs font-normal text-zinc-500">You can pay less than {formatUsd(assignment.feeCents)}, not more.</span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Payout date
                <input type="date" name="date" defaultValue={payout.scheduledFor} className={input} required />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Reason
              <textarea name="reason" rows={2} required className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
              <span className="text-xs font-normal text-zinc-500">Required. Saved to the audit log with your name.</span>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ActorSelect id="edit-actor" />
              <button className={buttonVariants()}>Save changes</button>
            </div>
          </form>

          <form action={reject} className="flex flex-col gap-3 rounded-[10px] border border-red-200 p-4">
            <input type="hidden" name="payoutId" value={payout.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Reject and hold
              <textarea name="reason" rows={2} required placeholder="Why is this payout held?" className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ActorSelect id="reject-actor" />
              <button className={buttonVariants({ variant: "outline" })}>Reject</button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 6: Top navigation**

In `src/app/layout.tsx`, replace the `<body>` element:
```tsx
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200">
          {/* Plain <a>: Bryntum pages need full page loads anyway. */}
          <nav aria-label="Main" className="mx-auto flex w-full max-w-7xl items-center gap-5 px-8 py-3 text-sm">
            <a href="/" className="font-semibold">On-Track</a>
            <a href="/" className="text-zinc-600 hover:text-zinc-950">Campaigns</a>
            <a href="/approvals" className="text-zinc-600 hover:text-zinc-950">Approvals</a>
          </nav>
        </header>
        {children}
      </body>
```

- [ ] **Step 7: Check it in the browser**

Run: `make db-reset`, then `npm run dev`, open http://localhost:3000/approvals.

Expected:
- One row: @jasonlifts, $1,200.00, fee $1,200.00, "Post checklist · Mei Tan", deposit Received, Oct 29, **Approve**.
- Click **Approve** → notice "1 approved and scheduled"; the row now shows **Send now** and "Edit or reject".
- **Edit or reject** → set amount `1,300` → notice "Amount is above the contract fee". Set `1,100`, a reason, save → back on the queue, row is awaiting approval again at $1,100.00.
- Approve again, then **Send now** → notice "Sent to PayPal…" and the row shows "Sent via PayPal". (This is a real $1,100 sandbox payout; check the batch in the PayPal developer dashboard. It stays "Sent" until Task 7's webhook marks it paid.)
- `npm run db:seed:fresh`, reload: no rows ("Nothing to approve").

- [ ] **Step 8: Commit**

```bash
npm test && npm run build
git add src
git status
git commit -m "feat: approval queue with batch approve, send now, edit and reject"
```

---

### Task 6: Client deposit and balance invoices (45 min)

**Files:**
- Create: `src/lib/services/client-invoices.ts`
- Modify: `src/lib/services/queries.ts` (add `getClientInvoices`)
- Create: `src/app/campaigns/[id]/actions.ts`
- Create: `src/components/DepositPanel.tsx`, `src/components/AutoRefresh.tsx`
- Modify: `src/app/campaigns/[id]/team/page.tsx` (notice + deposit panel)
- Test: `src/lib/services/client-invoices.int.test.ts`

**Interfaces:**
- Consumes: `createInvoice`, `sendInvoice` (Phase 1), `invoiceNumberFor`, `getInvoiceViewUrl` (Task 3), `ActionResult`, `writeAudit`, `backTo`, `actorFrom` (Tasks 1, 4, 5).
- Produces: `sendDepositInvoice(pp: PayPalClient, campaignId: string, actor: string, today: string): Promise<ActionResult>`, `createBalanceDraft(pp: PayPalClient, campaignId: string, actor: string, today: string): Promise<ActionResult>`, `getClientInvoices(campaignId: string)`, `<DepositPanel campaignId>`, `<AutoRefresh seconds>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/client-invoices.int.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PayPalClient } from "@/lib/paypal/client";
import { resetDb, seedAssignment } from "@/test/fixtures";
import { createBalanceDraft, sendDepositInvoice } from "./client-invoices";

function fakePayPal() {
  const request = vi.fn(async (method: string, path: string, _body?: unknown) => {
    if (method === "POST" && path === "/v2/invoicing/invoices") return { id: "INV2-NEW", status: "DRAFT" };
    if (method === "GET") return { detail: { metadata: { recipient_view_url: "https://sandbox.example/pay" } } };
    return {};
  });
  return { pp: { request } as unknown as PayPalClient, request };
}

async function withInvoices(depositStatus: "draft" | "sent" = "draft") {
  const base = await seedAssignment({ depositCleared: false });
  await db.insert(schema.clientInvoices).values([
    { campaignId: base.campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-19", status: depositStatus },
    { campaignId: base.campaign.id, kind: "balance", amountCents: 600000, dueDate: "2026-11-20", status: "draft" },
  ]);
  return base;
}
const invoice = async (kind: "deposit" | "balance") => (await db.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.kind, kind)))[0];

beforeEach(resetDb);

describe("sendDepositInvoice", () => {
  it("creates, sends and stores the payer link; due date never in the past", async () => {
    const { campaign } = await withInvoices();
    const { pp, request } = fakePayPal();
    expect(await sendDepositInvoice(pp, campaign.id, "Mei Tan", "2026-10-21")).toEqual({ ok: true });
    const create = request.mock.calls.find((c) => c[1] === "/v2/invoicing/invoices")!;
    expect(create[2]).toMatchObject({ detail: { payment_term: { due_date: "2026-10-21" } } });
    expect(request.mock.calls.some((c) => c[1] === "/v2/invoicing/invoices/INV2-NEW/send")).toBe(true);
    expect(await invoice("deposit")).toMatchObject({ status: "sent", paypalInvoiceId: "INV2-NEW", paypalViewUrl: "https://sandbox.example/pay" });
  });
  it("won't send twice", async () => {
    const { campaign } = await withInvoices("sent");
    const { pp, request } = fakePayPal();
    expect(await sendDepositInvoice(pp, campaign.id, "Mei Tan", "2026-10-21")).toEqual({ ok: false, reason: "The deposit invoice was already sent" });
    expect(request).not.toHaveBeenCalled();
  });
  it("reuses an invoice PayPal already created if the send failed last time", async () => {
    const { campaign } = await withInvoices();
    await db.update(schema.clientInvoices).set({ paypalInvoiceId: "INV2-OLD" }).where(eq(schema.clientInvoices.kind, "deposit"));
    const { pp, request } = fakePayPal();
    expect(await sendDepositInvoice(pp, campaign.id, "Mei Tan", "2026-10-21")).toEqual({ ok: true });
    expect(request.mock.calls.some((c) => c[1] === "/v2/invoicing/invoices")).toBe(false);
    expect(request.mock.calls.some((c) => c[1] === "/v2/invoicing/invoices/INV2-OLD/send")).toBe(true);
  });
});

describe("createBalanceDraft", () => {
  it("creates the balance invoice in PayPal as a draft and does not send it (R5)", async () => {
    const { campaign } = await withInvoices();
    const { pp, request } = fakePayPal();
    expect(await createBalanceDraft(pp, campaign.id, "Mei Tan", "2026-10-21")).toEqual({ ok: true });
    expect(request.mock.calls.some((c) => String(c[1]).endsWith("/send"))).toBe(false);
    expect(await invoice("balance")).toMatchObject({ status: "draft", paypalInvoiceId: "INV2-NEW" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:int`
Expected: FAIL, `./client-invoices` not found.

- [ ] **Step 3: Implement the service**

Create `src/lib/services/client-invoices.ts`:
```ts
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import type { PayPalClient } from "@/lib/paypal/client";
import { createInvoice, getInvoiceViewUrl, invoiceNumberFor, sendInvoice } from "@/lib/paypal/invoicing";
import { isUuid } from "@/lib/uuid";
import type { ActionResult } from "./payouts";

// Creates the PayPal invoice once (row lock + stored id), so a double click or a retry never makes two.
async function ensurePayPalInvoice(pp: PayPalClient, campaignId: string, kind: "deposit" | "balance", actor: string, today: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ inv: schema.clientInvoices, campaign: schema.campaigns, client: schema.clients })
      .from(schema.clientInvoices)
      .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.clientInvoices.campaignId))
      .innerJoin(schema.clients, eq(schema.clients.id, schema.campaigns.clientId))
      .where(and(eq(schema.clientInvoices.campaignId, campaignId), eq(schema.clientInvoices.kind, kind)))
      .for("update");
    if (!row) return { ok: false as const, reason: `This campaign has no ${kind} invoice` };
    if (row.inv.status !== "draft") return { ok: false as const, reason: `The ${kind} invoice was already sent` };
    if (row.inv.paypalInvoiceId) return { ok: true as const, row, paypalInvoiceId: row.inv.paypalInvoiceId, created: false };

    const created = await createInvoice(pp, {
      invoiceNumber: invoiceNumberFor(campaignId, kind),
      recipientEmail: row.client.email,
      itemName: `${row.campaign.name} · ${kind === "deposit" ? "deposit" : "balance"}`,
      amountCents: row.inv.amountCents,
      dueDate: row.inv.dueDate < today ? today : row.inv.dueDate, // PayPal won't take a due date in the past
    });
    await tx.update(schema.clientInvoices).set({ paypalInvoiceId: created.id }).where(eq(schema.clientInvoices.id, row.inv.id));
    await writeAudit(tx, { campaignId, actor, action: "invoice.created", detail: { kind, paypalInvoiceId: created.id, amountCents: row.inv.amountCents } });
    return { ok: true as const, row, paypalInvoiceId: created.id, created: true };
  });
}

// R5: one click sends the deposit invoice to the client through PayPal.
export async function sendDepositInvoice(pp: PayPalClient, campaignId: string, actor: string, today: string): Promise<ActionResult> {
  if (!isUuid(campaignId)) return { ok: false, reason: "Campaign not found" };
  const prepared = await ensurePayPalInvoice(pp, campaignId, "deposit", actor, today);
  if (!prepared.ok) return prepared;

  await sendInvoice(pp, prepared.paypalInvoiceId);
  const viewUrl = await getInvoiceViewUrl(pp, prepared.paypalInvoiceId).catch(() => null);
  await db.update(schema.clientInvoices).set({ status: "sent", paypalViewUrl: viewUrl }).where(eq(schema.clientInvoices.id, prepared.row.inv.id));
  await writeAudit(db, { campaignId, actor, action: "invoice.sent", detail: { kind: "deposit", paypalInvoiceId: prepared.paypalInvoiceId } });
  return { ok: true };
}

// R5: the balance invoice exists in PayPal as a draft with its due date; it is sent near the end.
export async function createBalanceDraft(pp: PayPalClient, campaignId: string, actor: string, today: string): Promise<ActionResult> {
  if (!isUuid(campaignId)) return { ok: false, reason: "Campaign not found" };
  const prepared = await ensurePayPalInvoice(pp, campaignId, "balance", actor, today);
  if (!prepared.ok) return prepared;
  return prepared.created ? { ok: true } : { ok: false, reason: "The balance draft already exists in PayPal" };
}
```

Add to `src/lib/services/queries.ts`:
```ts
export async function getClientInvoices(campaignId: string) {
  return db.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.campaignId, campaignId));
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:int`
Expected: all pass.

- [ ] **Step 5: Actions, panel, auto-refresh**

Create `src/app/campaigns/[id]/actions.ts`:
```ts
"use server";
import { agencyToday } from "@/lib/domain/today";
import { actorFrom, backTo, text } from "@/lib/form";
import { payPalFromEnv } from "@/lib/paypal/client";
import { createBalanceDraft, sendDepositInvoice } from "@/lib/services/client-invoices";

export async function sendDeposit(form: FormData) {
  const campaignId = text(form, "campaignId");
  const r = await sendDepositInvoice(payPalFromEnv(), campaignId, actorFrom(form), agencyToday());
  backTo(`/campaigns/${campaignId}/team`, r.ok ? "Deposit invoice sent to the client through PayPal." : r.reason);
}

export async function createBalance(form: FormData) {
  const campaignId = text(form, "campaignId");
  const r = await createBalanceDraft(payPalFromEnv(), campaignId, actorFrom(form), agencyToday());
  backTo(`/campaigns/${campaignId}/team`, r.ok ? "Balance invoice saved in PayPal as a draft." : r.reason);
}
```

Create `src/components/AutoRefresh.tsx`:
```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// R6: while we wait for PayPal's webhook, re-fetch the server data so the page updates by itself.
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
```

Create `src/components/DepositPanel.tsx`:
```tsx
import { createBalance, sendDeposit } from "@/app/campaigns/[id]/actions";
import ActorSelect from "@/components/ActorSelect";
import AutoRefresh from "@/components/AutoRefresh";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { getClientInvoices } from "@/lib/services/queries";

export default async function DepositPanel({ campaignId }: { campaignId: string }) {
  const invoices = await getClientInvoices(campaignId);
  const deposit = invoices.find((i) => i.kind === "deposit");
  const balance = invoices.find((i) => i.kind === "balance");

  return (
    <section aria-label="Client invoices" className="flex flex-col gap-3">
      {deposit?.status === "paid" && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-3 text-sm text-green-900">
          <strong className="font-semibold">Client deposit received · {formatUsd(deposit.amountCents)}.</strong> Creator payouts on this campaign are unlocked.
        </p>
      )}
      {deposit?.status === "sent" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm">
          <AutoRefresh seconds={5} />
          <span>
            <strong className="font-semibold">Deposit {formatUsd(deposit.amountCents)} sent.</strong> Waiting for the client to pay; this updates by itself.
          </span>
          {deposit.paypalViewUrl && (
            <a href={deposit.paypalViewUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open as client (sandbox)
            </a>
          )}
        </div>
      )}
      {(deposit?.status === "draft" || (balance?.status === "draft" && !balance.paypalInvoiceId)) && (
        <form className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 px-3.5 py-3 text-sm">
          <input type="hidden" name="campaignId" value={campaignId} />
          {deposit?.status === "draft" && (
            <span className="text-amber-900">Deposit {formatUsd(deposit.amountCents)} not sent. Creator payouts stay locked until it is paid.</span>
          )}
          <span className="flex-1" />
          <ActorSelect id="invoice-actor" />
          {deposit?.status === "draft" && (
            <button formAction={sendDeposit} className={buttonVariants({ size: "sm" })}>Send deposit invoice</button>
          )}
          {balance?.status === "draft" && !balance.paypalInvoiceId && (
            <button formAction={createBalance} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Create balance draft · due {formatDay(balance.dueDate)}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
```

In `src/app/campaigns/[id]/team/page.tsx`: accept `searchParams`, pass the notice into `TeamContent`, and render the notice and panel under the header:
```tsx
import DepositPanel from "@/components/DepositPanel";
import Notice from "@/components/Notice";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

export default function TeamPage({ params, searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading campaign…</p>}>
        <TeamContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function TeamContent({ params, searchParams }: Props) {
  const { id } = await params;
  const { notice } = await searchParams;
  // ...existing loadTimeline / notFound / clientName lines unchanged...
  return (
    <>
      <CampaignHeader campaign={data.campaign} clientName={clientName} active="team" />
      <Notice text={notice} />
      <DepositPanel campaignId={id} />
      {/* ...existing <TeamScheduler .../> unchanged... */}
    </>
  );
}
```

- [ ] **Step 6: Check it against the real sandbox**

Run: `npm run db:seed:fresh`, `npm run dev`, open the campaign's Team view.

Expected:
- Amber line "Deposit $6,000.00 not sent…", buttons **Send deposit invoice** and **Create balance draft · due Nov 20**.
- Click **Create balance draft** → notice "Balance invoice saved in PayPal as a draft." The button disappears.
- Click **Send deposit invoice** → notice "Deposit invoice sent…", grey "Waiting for the client to pay" line with **Open as client (sandbox)**.
- In the PayPal developer dashboard's sandbox invoices (or the client's sandbox inbox), the deposit invoice `OT-xxxxxxxx-DEP` exists. Don't pay it yet: nothing would hear about it until Task 7.

- [ ] **Step 7: Commit**

```bash
npm test && npm run test:int && npm run build
git add src
git status
git commit -m "feat: send the deposit invoice and save the balance draft in PayPal"
```

---

### Task 7: PayPal webhook unlocks payouts and settles them (60 min)

**Files:**
- Create: `src/lib/services/webhooks.ts`
- Create: `src/app/api/webhooks/paypal/route.ts`
- Test: `src/lib/services/webhooks.int.test.ts`

**Interfaces:**
- Consumes: `verifyWebhook`, `interpretEvent`, `PayPalWebhookEvent` (Task 3), `writeAudit`, `isUuid` (Task 1).
- Produces: `handlePayPalEvent(event: PayPalWebhookEvent): Promise<"processed" | "duplicate" | "ignored">`; route `POST /api/webhooks/paypal`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/webhooks.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, seedPayout } from "@/test/fixtures";
import { handlePayPalEvent } from "./webhooks";

beforeEach(resetDb);

const payoutRow = async (id: string) => (await db.select().from(schema.payouts).where(eq(schema.payouts.id, id)))[0];

describe("handlePayPalEvent", () => {
  it("deposit paid: invoice paid and the campaign's payouts unlock (R6, R15)", async () => {
    const { campaign } = await seedPayout({ depositCleared: false });
    await db.insert(schema.clientInvoices).values({ campaignId: campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-19", status: "sent", paypalInvoiceId: "INV2-T" });
    expect(await handlePayPalEvent({ id: "WH-1", event_type: "INVOICING.INVOICE.PAID", resource: { invoice: { id: "INV2-T" } } })).toBe("processed");
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
    expect(c.depositCleared).toBe(true);
    const [audit] = await db.select().from(schema.auditEvents);
    expect(audit).toMatchObject({ actor: "paypal", action: "invoice.paid" });
  });
  it("processes the same event id only once", async () => {
    const { campaign } = await seedPayout({ depositCleared: false });
    await db.insert(schema.clientInvoices).values({ campaignId: campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-19", status: "sent", paypalInvoiceId: "INV2-T" });
    const event = { id: "WH-1", event_type: "INVOICING.INVOICE.PAID", resource: { id: "INV2-T" } };
    expect(await handlePayPalEvent(event)).toBe("processed");
    expect(await handlePayPalEvent(event)).toBe("duplicate");
    expect(await db.select().from(schema.auditEvents)).toHaveLength(1);
  });
  it("payout succeeded: payout and assignment are paid (matched by sender_item_id)", async () => {
    const { payout, assignment } = await seedPayout({ status: "payout_sent", approvedBy: "Mei Tan" });
    await handlePayPalEvent({ id: "WH-2", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: { payout_batch_id: "B", payout_item: { sender_item_id: payout.id } } });
    expect((await payoutRow(payout.id)).status).toBe("paid");
    const [a] = await db.select().from(schema.assignments).where(eq(schema.assignments.id, assignment.id));
    expect(a.status).toBe("paid");
  });
  it("matches by batch id when the item id is missing", async () => {
    const { payout } = await seedPayout({ status: "payout_sent", approvedBy: "Mei Tan", paypalBatchId: "BATCH-9" });
    expect(await handlePayPalEvent({ id: "WH-3", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: { payout_batch_id: "BATCH-9" } })).toBe("processed");
    expect((await payoutRow(payout.id)).status).toBe("paid");
  });
  it("a late FAILED event does not undo a paid payout", async () => {
    const { payout } = await seedPayout({ status: "paid", approvedBy: "Mei Tan" });
    await handlePayPalEvent({ id: "WH-4", event_type: "PAYMENT.PAYOUTS-ITEM.FAILED", resource: { payout_item: { sender_item_id: payout.id } } });
    expect((await payoutRow(payout.id)).status).toBe("paid");
  });
  it("payout unclaimed: failed with the PayPal status as the reason", async () => {
    const { payout } = await seedPayout({ status: "payout_sent", approvedBy: "Mei Tan" });
    await handlePayPalEvent({ id: "WH-5", event_type: "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", resource: { payout_item: { sender_item_id: payout.id } } });
    expect(await payoutRow(payout.id)).toMatchObject({ status: "payout_failed", statusReason: "UNCLAIMED" });
  });
  it("records but ignores events for things it doesn't know", async () => {
    expect(await handlePayPalEvent({ id: "WH-6", event_type: "INVOICING.INVOICE.PAID", resource: { id: "INV2-UNKNOWN" } })).toBe("ignored");
    expect(await handlePayPalEvent({ id: "WH-6", event_type: "INVOICING.INVOICE.PAID", resource: { id: "INV2-UNKNOWN" } })).toBe("duplicate");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:int`
Expected: FAIL, `./webhooks` not found.

- [ ] **Step 3: Implement the handler**

Create `src/lib/services/webhooks.ts`:
```ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { interpretEvent, type PayPalWebhookEvent } from "@/lib/paypal/webhooks";
import { isUuid } from "@/lib/uuid";

// Idempotent: the event id is stored in the same transaction as its effects.
export async function handlePayPalEvent(event: PayPalWebhookEvent): Promise<"processed" | "duplicate" | "ignored"> {
  return db.transaction(async (tx) => {
    const fresh = await tx.insert(schema.webhookEvents).values({ id: event.id, eventType: event.event_type }).onConflictDoNothing().returning();
    if (!fresh.length) return "duplicate";

    const e = interpretEvent(event);

    if (e.kind === "invoice_paid") {
      const [inv] = await tx.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.paypalInvoiceId, e.paypalInvoiceId)).for("update");
      if (!inv) return "ignored";
      if (inv.status !== "paid") {
        await tx.update(schema.clientInvoices).set({ status: "paid" }).where(eq(schema.clientInvoices.id, inv.id));
        if (inv.kind === "deposit") {
          await tx.update(schema.campaigns).set({ depositCleared: true }).where(eq(schema.campaigns.id, inv.campaignId)); // R15 lock opens
        }
        await writeAudit(tx, { campaignId: inv.campaignId, actor: "paypal", action: "invoice.paid", detail: { kind: inv.kind, paypalInvoiceId: e.paypalInvoiceId, eventId: event.id } });
      }
      return "processed";
    }

    if (e.kind === "payout_item") {
      const where =
        e.payoutId && isUuid(e.payoutId) ? eq(schema.payouts.id, e.payoutId) : e.batchId ? eq(schema.payouts.paypalBatchId, e.batchId) : null;
      if (!where) return "ignored";
      const [row] = await tx
        .select({ payout: schema.payouts, assignment: schema.assignments })
        .from(schema.payouts)
        .innerJoin(schema.assignments, eq(schema.assignments.id, schema.payouts.assignmentId))
        .where(where)
        .for("update");
      if (!row) return "ignored";
      if (row.payout.status === "paid") return "processed"; // out-of-order event after success: keep paid

      if (e.outcome === "paid") {
        await tx.update(schema.payouts).set({ status: "paid", statusReason: null }).where(eq(schema.payouts.id, row.payout.id));
        await tx.update(schema.assignments).set({ status: "paid" }).where(eq(schema.assignments.id, row.assignment.id));
      } else {
        await tx.update(schema.payouts).set({ status: "payout_failed", statusReason: e.status }).where(eq(schema.payouts.id, row.payout.id));
      }
      await writeAudit(tx, {
        campaignId: row.assignment.campaignId,
        actor: "paypal",
        action: e.outcome === "paid" ? "payout.paid" : "payout.failed",
        detail: { payoutId: row.payout.id, paypalStatus: e.status, eventId: event.id },
      });
      return "processed";
    }

    return "ignored";
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:int`
Expected: all pass.

- [ ] **Step 5: The route**

Create `src/app/api/webhooks/paypal/route.ts`:
```ts
import { NextResponse } from "next/server";
import { payPalFromEnv } from "@/lib/paypal/client";
import { verifyWebhook, type PayPalWebhookEvent } from "@/lib/paypal/webhooks";
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
    console.log("[paypal webhook]", event.event_type, JSON.stringify(event.resource).slice(0, 1500));
  }

  // A thrown error returns 500, the transaction rolls back, and PayPal retries later.
  return NextResponse.json({ outcome: await handlePayPalEvent(event) });
}
```

- [ ] **Step 6: Register the webhook through a tunnel and test for real**

PayPal must reach your laptop. The dashboard's webhook *simulator* events can't be signature-verified, so test with real sandbox actions.

1. `npm run dev`, then in a second terminal: `cloudflared tunnel --url http://localhost:3000`. Copy the `https://….trycloudflare.com` URL it prints.
2. developer.paypal.com → Apps & Credentials → your sandbox app → **Sandbox Webhooks → Add Webhook**: URL `https://….trycloudflare.com/api/webhooks/paypal`; events **Invoicing: Invoice paid**, **Payouts item: succeeded, failed, unclaimed, blocked, denied, returned**. Save and copy the **Webhook ID**.
3. In `.env`: `PAYPAL_WEBHOOK_ID=<that id>` and `PAYPAL_WEBHOOK_DEBUG=1`. Restart `npm run dev` (keep the tunnel running; the URL changes if you restart it, and then the webhook must be edited).
4. **Deposit:** on the Team view (from Task 6), click **Open as client (sandbox)**, log in as the sandbox **personal** account and pay. Within about a minute the grey line turns into the green "Client deposit received" banner **without a reload**.
5. **Payout:** go to Approvals, approve @jasonlifts (now unlocked) and **Send now**. Within a few minutes the dev log shows `[paypal webhook] PAYMENT.PAYOUTS-ITEM.SUCCEEDED …` and the row leaves the queue (status `paid`).
6. Read the logged resource JSON once. If the invoice id or `sender_item_id` sit somewhere other than `interpretEvent` expects, add that path and a test case in Task 3's file before continuing. Then set `PAYPAL_WEBHOOK_DEBUG=0` (the resource contains payer emails).

- [ ] **Step 7: Commit**

```bash
npm test && npm run test:int && npm run build
git add src
git status   # .env must not be listed
git commit -m "feat: verified PayPal webhook marks deposits and payouts paid"
```

---

### Task 8: Influencer post proof and checklist (60 min)

Follows the prototype's **PostCheck** artboard. The AI pre-check button is Phase 3/4 (R24) and is not built now.

**Files:**
- Create: `src/lib/services/verification.ts` (post part)
- Modify: `src/lib/services/queries.ts` (add `getCampaignAssignments`, `getAssignmentDetail`)
- Create: `src/app/api/submissions/[id]/file/route.ts`
- Create: `src/components/AssignmentsTable.tsx`, `src/components/PostCheckSection.tsx`
- Create: `src/app/campaigns/[id]/assignments/[assignmentId]/page.tsx`, `.../actions.ts`
- Modify: `src/app/campaigns/[id]/team/page.tsx` (assignments table), `next.config.ts` (upload size)
- Test: `src/lib/services/verification.int.test.ts`

**Interfaces:**
- Consumes: `decidePostCheck`, `checklistFor`, `checkUpload`, `IMAGE_TYPES`, `UploadedFile` (Task 2), `queuePayout`, `ActionResult` (Task 4), `fileFrom`, `actorFrom`, `backTo`, `text` (Task 5).
- Produces: `submitPostCheck(input: { assignmentId: string; file: UploadedFile | null; link: string; ticked: string[]; intent: "verify" | "hold"; note: string; actor: string; today: string }): Promise<ActionResult>`; `getCampaignAssignments(campaignId)`, `getAssignmentDetail(assignmentId)`; route `/campaigns/[id]/assignments/[assignmentId]`; `GET /api/submissions/[id]/file`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/verification.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, seedAssignment } from "@/test/fixtures";
import { submitPostCheck } from "./verification";

const png = { name: "post.png", type: "image/png", size: 3, bytes: Buffer.from([1, 2, 3]) };
const ALL = ["brandTag", "hashtags", "window"];
const base = { link: "", note: "", actor: "Mei Tan", today: "2026-10-25" };

beforeEach(resetDb);

const assignmentRow = async (id: string) => (await db.select().from(schema.assignments).where(eq(schema.assignments.id, id)))[0];
const payoutsFor = (id: string) => db.select().from(schema.payouts).where(eq(schema.payouts.assignmentId, id));

describe("submitPostCheck", () => {
  it("verifies the post and queues a payout of the contract fee on the contract payout date (R9)", async () => {
    const { assignment } = await seedAssignment();
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ALL, intent: "verify" })).toEqual({ ok: true });
    expect((await assignmentRow(assignment.id)).status).toBe("verified");
    expect(await payoutsFor(assignment.id)).toMatchObject([{ status: "awaiting_approval", amountCents: 120000, scheduledFor: "2026-10-29" }]);
  });
  it("schedules a late verification for today, never in the past", async () => {
    const { assignment } = await seedAssignment({ payoutDate: "2026-10-20" });
    await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ALL, intent: "verify" });
    expect((await payoutsFor(assignment.id))[0].scheduledFor).toBe("2026-10-25");
  });
  it("holds with a note and creates no payout", async () => {
    const { assignment } = await seedAssignment();
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ["brandTag"], intent: "hold", note: "No #ad" })).toEqual({ ok: true });
    expect((await assignmentRow(assignment.id)).status).toBe("held");
    expect(await payoutsFor(assignment.id)).toHaveLength(0);
  });
  it("can't verify the same post twice (R16)", async () => {
    const { assignment } = await seedAssignment({ status: "verified" });
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ALL, intent: "verify" })).toEqual({ ok: false, reason: "This post is already verified" });
  });
  it("rejects a PDF or a missing file as post proof", async () => {
    const { assignment } = await seedAssignment();
    const pdf = { ...png, type: "application/pdf" };
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: pdf, ticked: ALL, intent: "verify" })).toEqual({ ok: false, reason: "Upload a PNG, JPEG or WebP image" });
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: null, ticked: ALL, intent: "verify" })).toEqual({ ok: false, reason: "Upload the post screenshot" });
  });
  it("refuses a checklist for a freelancer", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitPostCheck({ ...base, assignmentId: assignment.id, file: png, ticked: ALL, intent: "verify" })).toEqual({ ok: false, reason: "This assignment has no post checklist" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:int`
Expected: FAIL, `./verification` not found.

- [ ] **Step 3: Implement**

Create `src/lib/services/verification.ts`:
```ts
import { eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { writeAudit } from "@/lib/audit";
import { decidePostCheck } from "@/lib/domain/post-checklist";
import { checkUpload, IMAGE_TYPES, type UploadedFile } from "@/lib/domain/upload";
import { isUuid } from "@/lib/uuid";
import { queuePayout, type ActionResult } from "./payouts";

export async function lockAssignment(tx: Tx, assignmentId: string) {
  const [row] = await tx
    .select({ assignment: schema.assignments, creator: schema.creators, campaign: schema.campaigns })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId))
    .where(eq(schema.assignments.id, assignmentId))
    .for("update");
  return row ?? null;
}

// R7–R9: staff upload the post screenshot and confirm the checklist. Verified → payout queued for approval.
export async function submitPostCheck(input: {
  assignmentId: string;
  file: UploadedFile | null;
  link: string;
  ticked: string[];
  intent: "verify" | "hold";
  note: string;
  actor: string;
  today: string;
}): Promise<ActionResult> {
  if (!isUuid(input.assignmentId)) return { ok: false, reason: "Assignment not found" };
  if (!input.file) return { ok: false, reason: "Upload the post screenshot" };
  const fileError = checkUpload(input.file, IMAGE_TYPES);
  if (fileError) return { ok: false, reason: fileError };
  const link = input.link.trim();
  if (link && !link.startsWith("https://")) return { ok: false, reason: "The post link must start with https://" };
  const file = input.file;

  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockAssignment(tx, input.assignmentId);
    if (!row) return { ok: false, reason: "Assignment not found" };
    const { assignment, creator, campaign } = row;
    if (creator.type !== "influencer" || !assignment.brief) return { ok: false, reason: "This assignment has no post checklist" };
    if (assignment.status === "verified" || assignment.status === "paid") return { ok: false, reason: "This post is already verified" };

    const decision = decidePostCheck({ brief: assignment.brief, ticked: input.ticked, intent: input.intent, note: input.note });
    if (decision.kind === "invalid") return { ok: false, reason: decision.error };
    const pass = decision.kind === "verified";

    const [submission] = await tx
      .insert(schema.submissions)
      .values({ assignmentId: assignment.id, kind: "post_proof", fileName: file.name, fileType: file.type, file: file.bytes, link: link || null, submittedBy: input.actor })
      .returning();
    await tx.insert(schema.verifications).values({
      submissionId: submission.id,
      source: "user",
      task: "post_checklist",
      pass,
      checks: { ticked: decision.ticked, missing: decision.kind === "held" ? decision.missing : [] },
      note: decision.kind === "held" ? decision.note : null,
      createdBy: input.actor,
    });
    await tx.update(schema.assignments).set({ status: pass ? "verified" : "held" }).where(eq(schema.assignments.id, assignment.id));
    await writeAudit(tx, {
      campaignId: campaign.id,
      actor: input.actor,
      action: pass ? "post.verified" : "post.held",
      detail: decision.kind === "held" ? { assignmentId: assignment.id, missing: decision.missing, note: decision.note } : { assignmentId: assignment.id },
    });
    if (pass) {
      await queuePayout(tx, { campaignId: campaign.id, assignmentId: assignment.id, amountCents: assignment.feeCents, payoutDate: assignment.payoutDate, today: input.today, actor: input.actor });
    }
    return { ok: true };
  });
}
```

Add to `src/lib/services/queries.ts`:
```ts
export async function getCampaignAssignments(campaignId: string) {
  return db
    .select({ assignment: schema.assignments, creator: schema.creators })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .where(eq(schema.assignments.campaignId, campaignId))
    .orderBy(asc(schema.assignments.dueDate));
}

// Latest submission + its verification (file bytes left out; the image is served by its own route).
export async function getAssignmentDetail(assignmentId: string) {
  if (!isUuid(assignmentId)) return null;
  const [row] = await db
    .select({ assignment: schema.assignments, creator: schema.creators, campaign: schema.campaigns })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.assignments.campaignId))
    .where(eq(schema.assignments.id, assignmentId));
  if (!row) return null;
  const [latest] = await db
    .select({
      submissionId: schema.submissions.id,
      fileName: schema.submissions.fileName,
      fileType: schema.submissions.fileType,
      link: schema.submissions.link,
      submittedBy: schema.submissions.submittedBy,
      task: schema.verifications.task,
      pass: schema.verifications.pass,
      checks: schema.verifications.checks,
      note: schema.verifications.note,
      createdBy: schema.verifications.createdBy,
    })
    .from(schema.verifications)
    .innerJoin(schema.submissions, eq(schema.submissions.id, schema.verifications.submissionId))
    .where(eq(schema.submissions.assignmentId, assignmentId))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);
  const [payout] = await db.select().from(schema.payouts).where(eq(schema.payouts.assignmentId, assignmentId));
  return { ...row, latest: latest ?? null, payout: payout ?? null };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:int`
Expected: all pass.

- [ ] **Step 5: Allow 4 MB uploads through Server Actions**

In `next.config.ts`, add inside `nextConfig`:
```ts
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // 4 MB files + multipart overhead
  },
```

- [ ] **Step 6: Serve uploaded files**

Create `src/app/api/submissions/[id]/file/route.ts`:
```ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/uuid";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const [s] = await db
    .select({ file: schema.submissions.file, fileType: schema.submissions.fileType, fileName: schema.submissions.fileName })
    .from(schema.submissions)
    .where(eq(schema.submissions.id, id));
  if (!s) return new Response("Not found", { status: 404 });
  // fileType was allow-listed at upload (no SVG/HTML); nosniff stops the browser guessing otherwise.
  return new Response(new Uint8Array(s.file), {
    headers: {
      "Content-Type": s.fileType,
      "Content-Disposition": `inline; filename="${s.fileName.replace(/[^\w.-]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 7: Actions and the assignment page**

Create `src/app/campaigns/[id]/assignments/[assignmentId]/actions.ts`:
```ts
"use server";
import { agencyToday } from "@/lib/domain/today";
import { actorFrom, backTo, fileFrom, text } from "@/lib/form";
import { submitPostCheck } from "@/lib/services/verification";
import { isUuid } from "@/lib/uuid";

function pageOf(form: FormData): string {
  const campaignId = text(form, "campaignId");
  const assignmentId = text(form, "assignmentId");
  return isUuid(campaignId) && isUuid(assignmentId) ? `/campaigns/${campaignId}/assignments/${assignmentId}` : "/";
}

async function postCheck(form: FormData, intent: "verify" | "hold") {
  const r = await submitPostCheck({
    assignmentId: text(form, "assignmentId"),
    file: await fileFrom(form, "proof"),
    link: text(form, "link"),
    ticked: form.getAll("ticked").map(String),
    intent,
    note: text(form, "note"),
    actor: actorFrom(form),
    today: agencyToday(),
  });
  const done = intent === "verify" ? "Post verified. The payout is waiting for approval." : "Post held. No payout until a new screenshot passes.";
  backTo(pageOf(form), r.ok ? done : r.reason);
}

export async function verifyPost(form: FormData) {
  await postCheck(form, "verify");
}

export async function holdPost(form: FormData) {
  await postCheck(form, "hold");
}
```

Create `src/components/PostCheckSection.tsx`:
```tsx
import { holdPost, verifyPost } from "@/app/campaigns/[id]/assignments/[assignmentId]/actions";
import ActorSelect from "@/components/ActorSelect";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { checklistFor } from "@/lib/domain/post-checklist";
import type { getAssignmentDetail } from "@/lib/services/queries";

type Detail = NonNullable<Awaited<ReturnType<typeof getAssignmentDetail>>>;

export default function PostCheckSection({ detail }: { detail: Detail }) {
  const { assignment, campaign, latest, payout } = detail;
  const brief = assignment.brief!;
  const done = assignment.status === "verified" || assignment.status === "paid";

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section aria-label="Proof" className="flex max-w-full flex-[1_1_320px] flex-col gap-3">
        {latest ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from our own route, any size
          <img src={`/api/submissions/${latest.submissionId}/file`} alt={`Latest post screenshot, uploaded by ${latest.submittedBy}`} className="w-full rounded-[10px] border border-zinc-200" />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center rounded-[10px] border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500">No screenshot yet</div>
        )}
        {latest?.link && (
          <a href={latest.link} target="_blank" rel="noreferrer" className="text-sm text-zinc-600 underline-offset-4 hover:underline">Open the post</a>
        )}
      </section>

      <section aria-label="Checklist" className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-zinc-200 bg-zinc-50 p-4">
          <span className="text-xs font-medium text-zinc-500">Brief from contract</span>
          <span className="text-sm">
            {assignment.deliverable} · tag <strong>{brief.brandTag}</strong> · hashtags <strong>{brief.hashtags.join(" ")}</strong> · post between{" "}
            <strong>{formatDay(brief.windowStart)} – {formatDay(brief.windowEnd)}</strong>
          </span>
        </div>

        {done && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-green-200 bg-green-50 px-4 py-3.5 text-sm text-green-900">
            <span>
              <strong className="font-semibold">Post verified.</strong>{" "}
              {payout ? `A ${formatUsd(payout.amountCents)} payout is ${payout.status === "paid" ? "paid" : "in the approval queue"}.` : ""}
            </span>
            <a href="/approvals" className={buttonVariants({ variant: "outline", size: "sm" })}>Open approvals</a>
          </div>
        )}
        {assignment.status === "held" && latest?.note && (
          <p role="status" className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-900">
            <strong className="font-semibold">Held.</strong> {latest.note} No payout is created until a new screenshot passes the checklist.
          </p>
        )}

        {!done && (
          <form className="flex flex-col gap-4">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="assignmentId" value={assignment.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Post screenshot
              <input type="file" name="proof" accept="image/png,image/jpeg,image/webp" required className="text-sm" />
              <span className="text-xs font-normal text-zinc-500">PNG, JPEG or WebP, up to 4 MB. Sent by the creator, uploaded by you.</span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Post link (optional)
              <input type="url" name="link" placeholder="https://instagram.com/p/…" className="min-h-10 rounded-md border border-zinc-200 px-3 text-sm" />
            </label>
            <fieldset className="rounded-[10px] border border-zinc-200">
              <legend className="sr-only">Checklist</legend>
              {checklistFor(brief).map((item) => (
                <label key={item.id} className="flex cursor-pointer items-start gap-3 border-b border-zinc-100 px-4 py-3.5 last:border-b-0">
                  <input type="checkbox" name="ticked" value={item.id} className="mt-0.5 size-[18px] accent-zinc-900" />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-[13px] text-zinc-500">{item.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Note (needed to hold)
              <textarea name="note" rows={2} placeholder="What's missing? This goes in the audit log." className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ActorSelect />
              <button formAction={holdPost} className={buttonVariants({ variant: "outline" })}>Hold with note</button>
              <button formAction={verifyPost} className={buttonVariants()}>Mark verified</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
```

Create `src/app/campaigns/[id]/assignments/[assignmentId]/page.tsx`:
```tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Notice from "@/components/Notice";
import PostCheckSection from "@/components/PostCheckSection";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { getAssignmentDetail } from "@/lib/services/queries";

type Props = { params: Promise<{ id: string; assignmentId: string }>; searchParams: Promise<{ notice?: string }> };

export default function AssignmentPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Content {...props} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Props) {
  const { id, assignmentId } = await params;
  const { notice } = await searchParams;
  const detail = await getAssignmentDetail(assignmentId);
  if (!detail || detail.campaign.id !== id) notFound();
  const { creator, assignment, campaign } = detail;
  const influencer = creator.type === "influencer";

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1.5 text-[13px] text-zinc-500">
          <a href="/" className="hover:text-zinc-950">Campaigns</a>
          <span aria-hidden="true">/</span>
          <a href={`/campaigns/${campaign.id}/team`} className="hover:text-zinc-950">{campaign.name}</a>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-950">{influencer ? "Verify post" : "Invoice"}</span>
        </nav>
        <h1 className="text-[26px] font-semibold tracking-tight">{influencer ? "Verify post" : "Invoice"} · {creator.name}</h1>
        <p className="text-sm text-zinc-500">
          {influencer ? "Influencer" : "Freelancer"} · {creator.detail} · contract fee {formatUsd(assignment.feeCents)} · due {formatDay(assignment.dueDate)}
        </p>
      </div>
      <Notice text={notice} />
      {influencer ? (
        <PostCheckSection detail={detail} />
      ) : (
        <p className="text-sm text-zinc-500">Freelancers have no checklist; they are paid against their invoice.</p>
      )}
    </>
  );
}
```

Create `src/components/AssignmentsTable.tsx`:
```tsx
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { getCampaignAssignments } from "@/lib/services/queries";

const STATUS: Record<string, string> = { scheduled: "Scheduled", submitted: "Submitted", verified: "Verified", held: "Held", paid: "Paid" };

export default async function AssignmentsTable({ campaignId }: { campaignId: string }) {
  const rows = await getCampaignAssignments(campaignId);
  return (
    <section aria-label="Assignments" className="overflow-x-auto rounded-[10px] border border-zinc-200">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
          <tr>
            <th className="px-4 py-3">Creator</th>
            <th className="px-4 py-3">Deliverable</th>
            <th className="px-4 py-3">Fee</th>
            <th className="px-4 py-3">Due</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map(({ assignment, creator }) => (
            <tr key={assignment.id}>
              <td className="px-4 py-3 font-medium">{creator.name}</td>
              <td className="px-4 py-3 text-zinc-600">{assignment.deliverable}</td>
              <td className="px-4 py-3 tabular-nums">{formatUsd(assignment.feeCents)}</td>
              <td className="px-4 py-3 tabular-nums">{formatDay(assignment.dueDate)}</td>
              <td className={`px-4 py-3 ${assignment.status === "held" ? "font-medium text-red-700" : ""}`}>{STATUS[assignment.status]}</td>
              <td className="px-4 py-3 text-right">
                <a href={`/campaigns/${campaignId}/assignments/${assignment.id}`} className="text-zinc-600 underline-offset-4 hover:underline">
                  {creator.type === "influencer" ? "Verify post" : "Invoice"}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

In `src/app/campaigns/[id]/team/page.tsx`, add `import AssignmentsTable from "@/components/AssignmentsTable";` and render `<AssignmentsTable campaignId={id} />` right after `<TeamScheduler … />`.

- [ ] **Step 8: Check it in the browser**

Restart `npm run dev` (next.config changed). `npm run db:seed:fresh`; send and pay the deposit (Task 7) or temporarily run `docker compose exec db psql -U ontrack ontrack -c "update campaigns set deposit_cleared = true"`.

Expected:
- Team view shows the assignments table; **Verify post** on @mira.travels opens the page with brief, upload, 3 checkboxes.
- Tick 2 items, **Mark verified** → notice "Tick every item to verify. Missing: Posted inside the window". Nothing saved.
- **Hold with note** with an empty note → "A note is required to hold".
- Upload a PNG, tick all 3, **Mark verified** → green "Post verified… in the approval queue", the screenshot shows on the left, and /approvals lists @mira.travels at $2,000.00.
- Try uploading an `.svg` → "Upload a PNG, JPEG or WebP image". (An SVG renamed to `.png` gets through, because the browser labels it `image/png`, but it is served back as `image/png` with `nosniff`, so it can only render as a broken image, never run as SVG.)

- [ ] **Step 9: Commit**

```bash
npm test && npm run test:int && npm run build
git add src next.config.ts
git status
git commit -m "feat: post proof upload and checklist verification queue payouts"
```

---

### Task 9: Freelancer invoice: match against the contract, hold, override (60 min)

Follows the prototype's **Invoice** artboard. Staff type the invoice fields this week; Phase 3's InvoiceMatcher fills the same fields with Claude and the comparison stays this code.

**Files:**
- Modify: `src/lib/services/verification.ts` (add `submitInvoice`, `overrideInvoice`)
- Modify: `src/app/campaigns/[id]/assignments/[assignmentId]/actions.ts` (two actions)
- Create: `src/components/InvoiceSection.tsx`
- Modify: `src/app/campaigns/[id]/assignments/[assignmentId]/page.tsx` (render it)
- Test: `src/lib/services/verification.int.test.ts` (new describe blocks)

**Interfaces:**
- Consumes: `compareInvoice`, `payoutAmountFor`, `parseUsdToCents`, `INVOICE_TYPES`, `FieldComparison` (Task 2), `lockAssignment` (Task 8), `queuePayout` (Task 4).
- Produces: `submitInvoice(input: { assignmentId: string; file: UploadedFile | null; payee: string; paypalEmail: string; deliverable: string; amount: string; actor: string; today: string }): Promise<ActionResult>`, `overrideInvoice(input: { assignmentId: string; reason: string; actor: string; today: string }): Promise<ActionResult>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/services/verification.int.test.ts` (and add `overrideInvoice, submitInvoice` to the import from `./verification`):
```ts
const pdf = { name: "INV-0142.pdf", type: "application/pdf", size: 3, bytes: Buffer.from([1, 2, 3]) };
const fields = { payee: "Daniel Lim", paypalEmail: "daniel@example.com", deliverable: "2 x 30s product video edits", amount: "1,000.00" };
const who = { actor: "Mei Tan", today: "2026-10-27" };

describe("submitInvoice", () => {
  it("a matching invoice verifies the work and queues the contract fee (R12)", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitInvoice({ ...who, ...fields, assignmentId: assignment.id, file: pdf })).toEqual({ ok: true });
    expect((await assignmentRow(assignment.id)).status).toBe("verified");
    expect(await payoutsFor(assignment.id)).toMatchObject([{ amountCents: 100000, status: "awaiting_approval" }]);
  });
  it("a $1,200 invoice on a $1,000 contract is held with both values recorded, and no payout", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitInvoice({ ...who, ...fields, amount: "1,200.00", assignmentId: assignment.id, file: pdf })).toEqual({ ok: true });
    expect((await assignmentRow(assignment.id)).status).toBe("held");
    expect(await payoutsFor(assignment.id)).toHaveLength(0);
    const [v] = await db.select().from(schema.verifications);
    expect(v).toMatchObject({ task: "invoice_match", pass: false });
    expect((v.checks as { fields: Array<{ field: string; contract: string; invoice: string; ok: boolean }> }).fields).toContainEqual({
      field: "amount", label: "Amount", contract: "$1,000.00", invoice: "$1,200.00", ok: false,
    });
  });
  it("rejects an amount it can't read", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitInvoice({ ...who, ...fields, amount: "12.345", assignmentId: assignment.id, file: pdf })).toEqual({ ok: false, reason: "Enter the invoiced amount like 1,200.00" });
  });
});

describe("overrideInvoice", () => {
  it("pays the contract fee, not the higher invoiced amount, and logs the reason", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    await submitInvoice({ ...who, ...fields, amount: "1,200.00", assignmentId: assignment.id, file: pdf });
    expect(await overrideInvoice({ ...who, assignmentId: assignment.id, reason: "Client approved an extra revision" })).toEqual({ ok: true });
    expect(await payoutsFor(assignment.id)).toMatchObject([{ amountCents: 100000, status: "awaiting_approval" }]);
    const actions = (await db.select().from(schema.auditEvents)).map((a) => a.action);
    expect(actions).toContain("invoice.override");
  });
  it("pays the lower invoiced amount when the invoice is under the fee", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    await submitInvoice({ ...who, ...fields, amount: "900", assignmentId: assignment.id, file: pdf });
    await overrideInvoice({ ...who, assignmentId: assignment.id, reason: "Partial delivery agreed" });
    expect((await payoutsFor(assignment.id))[0].amountCents).toBe(90000);
  });
  it("needs a reason, and a held invoice to override", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await overrideInvoice({ ...who, assignmentId: assignment.id, reason: " " })).toEqual({ ok: false, reason: "A reason is required to override" });
    expect(await overrideInvoice({ ...who, assignmentId: assignment.id, reason: "x" })).toEqual({ ok: false, reason: "There is no held invoice to override" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:int`
Expected: FAIL, `submitInvoice` / `overrideInvoice` not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/services/verification.ts` (extend the imports: `desc` from drizzle-orm; `compareInvoice`, `payoutAmountFor` from `@/lib/domain/invoice-match`; `parseUsdToCents` from `@/lib/domain/money`; `INVOICE_TYPES` from `@/lib/domain/upload`):
```ts
// R10–R12: staff upload the freelancer's invoice and type its fields; code compares them with the contract.
export async function submitInvoice(input: {
  assignmentId: string;
  file: UploadedFile | null;
  payee: string;
  paypalEmail: string;
  deliverable: string;
  amount: string;
  actor: string;
  today: string;
}): Promise<ActionResult> {
  if (!isUuid(input.assignmentId)) return { ok: false, reason: "Assignment not found" };
  if (!input.file) return { ok: false, reason: "Upload the invoice" };
  const fileError = checkUpload(input.file, INVOICE_TYPES);
  if (fileError) return { ok: false, reason: fileError };
  const amountCents = parseUsdToCents(input.amount);
  if (amountCents === null) return { ok: false, reason: "Enter the invoiced amount like 1,200.00" };
  const file = input.file;

  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockAssignment(tx, input.assignmentId);
    if (!row) return { ok: false, reason: "Assignment not found" };
    const { assignment, creator, campaign } = row;
    if (creator.type !== "freelancer") return { ok: false, reason: "Influencers are verified with the post checklist" };
    if (assignment.status === "verified" || assignment.status === "paid") return { ok: false, reason: "This work is already verified" };

    const invoice = { payee: input.payee, paypalEmail: input.paypalEmail, deliverable: input.deliverable, currency: "USD", amountCents };
    const result = compareInvoice(
      { payee: creator.name, paypalEmail: creator.paypalEmail, deliverable: assignment.deliverable, currency: campaign.currency, feeCents: assignment.feeCents },
      invoice,
    );

    const [submission] = await tx
      .insert(schema.submissions)
      .values({ assignmentId: assignment.id, kind: "invoice", fileName: file.name, fileType: file.type, file: file.bytes, submittedBy: input.actor })
      .returning();
    await tx.insert(schema.verifications).values({
      submissionId: submission.id,
      source: "user",
      task: "invoice_match",
      pass: result.match,
      checks: { fields: result.fields, invoice },
      createdBy: input.actor,
    });
    await tx.update(schema.assignments).set({ status: result.match ? "verified" : "held" }).where(eq(schema.assignments.id, assignment.id));
    await writeAudit(tx, {
      campaignId: campaign.id,
      actor: input.actor,
      action: result.match ? "invoice.matched" : "invoice.held",
      detail: { assignmentId: assignment.id, mismatches: result.fields.filter((f) => !f.ok) },
    });
    if (result.match) {
      await queuePayout(tx, { campaignId: campaign.id, assignmentId: assignment.id, amountCents: assignment.feeCents, payoutDate: assignment.payoutDate, today: input.today, actor: input.actor });
    }
    return { ok: true };
  });
}

// R12: a held invoice can be paid anyway with a written reason. Pays min(invoiced, fee), never more than the contract.
export async function overrideInvoice(input: { assignmentId: string; reason: string; actor: string; today: string }): Promise<ActionResult> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, reason: "A reason is required to override" };
  if (!isUuid(input.assignmentId)) return { ok: false, reason: "Assignment not found" };

  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockAssignment(tx, input.assignmentId);
    if (!row) return { ok: false, reason: "Assignment not found" };
    const [latest] = await tx
      .select({ submissionId: schema.verifications.submissionId, task: schema.verifications.task, pass: schema.verifications.pass, checks: schema.verifications.checks })
      .from(schema.verifications)
      .innerJoin(schema.submissions, eq(schema.submissions.id, schema.verifications.submissionId))
      .where(eq(schema.submissions.assignmentId, row.assignment.id))
      .orderBy(desc(schema.verifications.createdAt))
      .limit(1);
    if (row.assignment.status !== "held" || !latest || latest.task !== "invoice_match" || latest.pass) {
      return { ok: false, reason: "There is no held invoice to override" };
    }
    const invoicedCents = (latest.checks as { invoice: { amountCents: number } }).invoice.amountCents;
    const amountCents = payoutAmountFor(row.assignment.feeCents, invoicedCents);

    await tx.insert(schema.verifications).values({ submissionId: latest.submissionId, source: "user", task: "invoice_override", pass: true, note: reason, createdBy: input.actor });
    await tx.update(schema.assignments).set({ status: "verified" }).where(eq(schema.assignments.id, row.assignment.id));
    await writeAudit(tx, { campaignId: row.campaign.id, actor: input.actor, action: "invoice.override", detail: { assignmentId: row.assignment.id, reason, invoicedCents, payoutCents: amountCents } });
    await queuePayout(tx, { campaignId: row.campaign.id, assignmentId: row.assignment.id, amountCents, payoutDate: row.assignment.payoutDate, today: input.today, actor: input.actor });
    return { ok: true };
  });
}
```

Note: the override verification is inserted in a later transaction than the held one, so its `createdAt` is later and it becomes the "latest" verification `canPay` sees.

- [ ] **Step 4: Run the tests**

Run: `npm run test:int`
Expected: all pass.

- [ ] **Step 5: Actions and the invoice section**

Add to `src/app/campaigns/[id]/assignments/[assignmentId]/actions.ts` (import `overrideInvoice, submitInvoice` too):
```ts
export async function checkInvoice(form: FormData) {
  const r = await submitInvoice({
    assignmentId: text(form, "assignmentId"),
    file: await fileFrom(form, "invoice"),
    payee: text(form, "payee"),
    paypalEmail: text(form, "paypalEmail"),
    deliverable: text(form, "deliverable"),
    amount: text(form, "amount"),
    actor: actorFrom(form),
    today: agencyToday(),
  });
  backTo(pageOf(form), r.ok ? "Invoice checked against the contract." : r.reason);
}

export async function overrideHeldInvoice(form: FormData) {
  const r = await overrideInvoice({ assignmentId: text(form, "assignmentId"), reason: text(form, "reason"), actor: actorFrom(form), today: agencyToday() });
  backTo(pageOf(form), r.ok ? "Override logged. The payout is waiting for approval." : r.reason);
}
```

Create `src/components/InvoiceSection.tsx`:
```tsx
import { checkInvoice, overrideHeldInvoice } from "@/app/campaigns/[id]/assignments/[assignmentId]/actions";
import ActorSelect from "@/components/ActorSelect";
import { buttonVariants } from "@/components/ui/button";
import type { FieldComparison } from "@/lib/domain/invoice-match";
import { formatUsd } from "@/lib/domain/money";
import type { getAssignmentDetail } from "@/lib/services/queries";

type Detail = NonNullable<Awaited<ReturnType<typeof getAssignmentDetail>>>;
const input = "min-h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm font-normal";

export default function InvoiceSection({ detail }: { detail: Detail }) {
  const { assignment, campaign, latest, payout } = detail;
  const fields = latest?.task === "invoice_match" ? ((latest.checks as { fields?: FieldComparison[] }).fields ?? []) : [];
  const held = assignment.status === "held" && latest?.task === "invoice_match" && !latest.pass;
  const done = assignment.status === "verified" || assignment.status === "paid";
  const hidden = (
    <>
      <input type="hidden" name="campaignId" value={campaign.id} />
      <input type="hidden" name="assignmentId" value={assignment.id} />
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {held && (
        <p role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-900">
          <strong className="font-semibold">Payout held.</strong> The invoice doesn&apos;t match the contract. Upload a corrected invoice, or override with a reason.
        </p>
      )}
      {done && (
        <p role="status" className="rounded-[10px] border border-green-200 bg-green-50 px-4 py-3.5 text-sm text-green-900">
          <strong className="font-semibold">{latest?.task === "invoice_override" ? "Override logged." : "Invoice matches."}</strong>{" "}
          {payout ? `A ${formatUsd(payout.amountCents)} payout is ${payout.status === "paid" ? "paid" : "in the approval queue"}.` : ""}
        </p>
      )}

      {fields.length > 0 && (
        <div className="overflow-x-auto rounded-[10px] border border-zinc-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
              <tr>
                <th className="px-4 py-3">Field</th>
                <th className="px-2 py-3">Contract</th>
                <th className="px-2 py-3">Invoice</th>
                <th className="px-4 py-3 text-right">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {fields.map((f) => (
                <tr key={f.field} className={f.ok ? "" : "bg-red-50"}>
                  <td className="px-4 py-3.5 font-medium">{f.label}</td>
                  <td className="px-2 py-3.5 text-zinc-700">{f.contract}</td>
                  <td className={`px-2 py-3.5 ${f.ok ? "text-zinc-700" : "font-semibold text-red-900"}`}>{f.invoice}</td>
                  <td className={`px-4 py-3.5 text-right text-xs font-semibold ${f.ok ? "text-green-700" : "text-red-700"}`}>{f.ok ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {held && (
        <form action={overrideHeldInvoice} className="flex flex-col gap-3 rounded-[10px] border border-zinc-200 p-4">
          {hidden}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Reason (needed to override)
            <textarea name="reason" rows={2} required placeholder="e.g. Client approved an extra revision in writing on Oct 25" className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-normal" />
            <span className="text-xs font-normal text-zinc-500">Pays what was invoiced, capped at the contract fee of {formatUsd(assignment.feeCents)}.</span>
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ActorSelect id="override-actor" />
            <button className={buttonVariants({ variant: "outline" })}>Override with reason</button>
          </div>
        </form>
      )}

      {!done && (
        <form action={checkInvoice} className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 p-4">
          {hidden}
          <h2 className="text-[15px] font-semibold">{fields.length ? "Upload a corrected invoice" : "Check the invoice"}</h2>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Invoice file
            <input type="file" name="invoice" accept="application/pdf,image/png,image/jpeg,image/webp" required className="text-sm font-normal" />
          </label>
          <p className="text-xs text-zinc-500">Type what the invoice says, not what the contract says. The comparison is done by On-Track&apos;s rules.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">Payee<input name="payee" required className={input} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">PayPal email<input name="paypalEmail" type="email" required className={input} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Deliverable<input name="deliverable" required className={input} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Amount (USD)<input name="amount" inputMode="decimal" placeholder="1,000.00" required className={input} /></label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ActorSelect id="invoice-actor" />
            <button className={buttonVariants()}>Check against contract</button>
          </div>
        </form>
      )}
    </div>
  );
}
```

In `src/app/campaigns/[id]/assignments/[assignmentId]/page.tsx`, import `InvoiceSection` and replace the freelancer line:
```tsx
      {influencer ? <PostCheckSection detail={detail} /> : <InvoiceSection detail={detail} />}
```

- [ ] **Step 6: Check it in the browser**

`npm run db:seed` (mid-campaign: deposit cleared). Team view → Daniel Lim → **Invoice**.

Expected:
- Enter Daniel Lim / your `SANDBOX_CREATOR_EMAIL` / `2 × 30s product video edits` / `1,200.00` with any PDF → red "Payout held", table with Amount $1,000.00 vs **$1,200.00** "No". Team view now shows Daniel's chip red ("Held").
- **Override with reason** with an empty reason → browser blocks it; with "Client approved an extra revision" → "Override logged…", /approvals lists Daniel at **$1,000.00** with "Invoice override · Mei Tan".

- [ ] **Step 7: Commit**

```bash
npm test && npm run test:int && npm run build
git add src
git status
git commit -m "feat: freelancer invoice matched against the contract, with hold and override"
```

---

### Task 10: Daily payout run, audit log page, Phase 2 checkpoint (45 min)

**Files:**
- Create: `src/app/api/payouts/run-due/route.ts`
- Modify: `src/lib/services/queries.ts` (add `listAuditEvents`)
- Create: `src/app/campaigns/[id]/audit/page.tsx`
- Modify: `src/components/CampaignHeader.tsx` (Audit log link)
- Modify: this plan (Phase 2 notes)

**Interfaces:**
- Consumes: `runDuePayouts` (Task 4), `agencyToday`, `AGENCY_TZ` (Task 1).
- Produces: `POST /api/payouts/run-due` (Bearer `CRON_SECRET`; Phase 3's Render Cron calls it), `listAuditEvents(campaignId: string)`, route `/campaigns/[id]/audit`.

- [ ] **Step 1: The daily run route**

Create `src/app/api/payouts/run-due/route.ts`:
```ts
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
```

Check it:
```bash
curl -s -X POST http://localhost:3000/api/payouts/run-due                     # → 401
curl -s -X POST -H "Authorization: Bearer $(grep ^CRON_SECRET= .env | cut -d= -f2-)" http://localhost:3000/api/payouts/run-due
```
Expected: second call returns `{"today":"2026-…","results":[…]}`; only payouts that are `scheduled` with a date on or before today are listed.

- [ ] **Step 2: The audit log page**

Add to `src/lib/services/queries.ts`:
```ts
export async function listAuditEvents(campaignId: string) {
  return db.select().from(schema.auditEvents).where(eq(schema.auditEvents.campaignId, campaignId)).orderBy(desc(schema.auditEvents.at)).limit(200);
}
```

Create `src/app/campaigns/[id]/audit/page.tsx`:
```tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AGENCY_TZ } from "@/lib/domain/today";
import { formatUsd } from "@/lib/domain/money";
import { loadTimeline } from "@/lib/load-timeline";
import { listAuditEvents } from "@/lib/services/queries";

type Props = { params: Promise<{ id: string }> };
const when = new Intl.DateTimeFormat("en-GB", { timeZone: AGENCY_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// One readable line per event; amounts in cents become dollars.
function describe(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([k]) => !k.endsWith("Id") && k !== "eventId")
    .map(([k, v]) => `${k}: ${typeof v === "number" && /cents/i.test(k) ? formatUsd(v) : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function AuditPage({ params }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading audit log…</p>}>
        <Audit params={params} />
      </Suspense>
    </main>
  );
}

async function Audit({ params }: Props) {
  const { id } = await params;
  const data = await loadTimeline(id);
  if (!data) notFound();
  const events = await listAuditEvents(id);
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-zinc-500">
        <a href="/" className="hover:text-zinc-950">Campaigns</a>
        <span aria-hidden="true">/</span>
        <a href={`/campaigns/${id}/team`} className="hover:text-zinc-950">{data.campaign.name}</a>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-950">Audit log</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight">Audit log</h1>
      <ol className="divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 text-sm">
        {events.length === 0 && <li className="px-4 py-6 text-zinc-500">Nothing logged yet.</li>}
        {events.map((e) => (
          <li key={e.id} className="grid grid-cols-[110px_120px_1fr] gap-3 px-4 py-3">
            <span className="tabular-nums text-zinc-500">{when.format(e.at)}</span>
            <span className="font-medium">{e.actor}</span>
            <span>
              <span className="font-mono text-xs">{e.action}</span>
              <span className="block text-zinc-600">{describe(e.detail as Record<string, unknown>)}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
```

In `src/components/CampaignHeader.tsx`, add an "Audit log" link after the breadcrumb `<nav>` closes, inside the same column:
```tsx
        <a href={`/campaigns/${campaign.id}/audit`} className="self-start text-[13px] text-zinc-500 underline-offset-4 hover:text-zinc-950 hover:underline">
          Audit log
        </a>
```

- [ ] **Step 3: Full demo run-through (R5 → R26)**

`npm run db:seed:fresh`, tunnel running, `npm run dev`:
1. Send deposit → pay as the sandbox client → green "deposit received" banner appears by itself.
2. Verify @aina.eats's post (all ticks) → payout in /approvals.
3. Daniel's invoice at $1,200 → held → override → payout $1,000 in /approvals.
4. Select both in /approvals → **Approve & schedule selected** → "2 approved and scheduled".
5. Edit Daniel's payout down to $900 with a reason → back to awaiting approval → approve.
6. **Send now** on @aina.eats → turns paid via webhook.
7. Open **Audit log**: every step above is listed with the person or `paypal`.

- [ ] **Step 4: Phase 2 notes**

Add a "Phase 2 notes" section at the bottom of this plan: the real webhook resource shapes you logged in Task 7, anything PayPal rejected, and how long webhooks took to arrive. Phase 3 is written from these notes.

- [ ] **Step 5: Commit**

```bash
npm test && npm run test:int && npm run build
git add src docs
git status   # .env must not be listed
git commit -m "feat: daily payout run route and campaign audit log; phase 2 checkpoint"
```

---

## What comes next

| Phase | Dates | Covers |
|---|---|---|
| **3: AI + views + deploy** | Oct 26–Nov 1 | ContractExtractor and InvoiceMatcher with Claude Haiku 5.5 filling the Task 9 fields (R1–R3, R11); eval set (Q7); colours, side panel, polling (R13, R14, R18); drag to reschedule (R19); deploy to Render with the webhook URL and a daily Cron Job calling `/api/payouts/run-due` |
| **4: Polish** | Nov 2–8 | Eval targets, retry for failed payouts (needs a new `sender_batch_id`), "Request corrected invoice" email, reset-demo button, README, R24 / R20 / R22 if time |
| **Submit** | Nov 9–11 | Video (≤ 2:50), Devpost text, submit Nov 11 |

---

## Phase 2 notes

**Webhook resource shapes (real sandbox, Oct 17)**
- `PAYMENT.PAYOUTS-ITEM.*`: `resource.payout_item.sender_item_id` (= our payout id), `resource.payout_batch_id`, `resource.transaction_status`. A failed item also carries `resource.errors.name` (e.g. `SELF_PAY_NOT_ALLOWED`); `interpretEvent` now returns it as `reason` and it is stored as the payout's `statusReason`.
- `PAYMENT.PAYOUTSBATCH.*` (PROCESSING, SUCCESS, DENIED) and `INVOICING.INVOICE.CREATED` / `SENT` also arrive; they are recorded in `webhook_events` and ignored. Only item events settle a payout.

**What PayPal rejected**
- `SELF_PAY_NOT_ALLOWED`: `SANDBOX_CREATOR_EMAIL` was the sending business account. Payees must be a different (personal) sandbox account.
- The dashboard webhook simulator can't be signature-verified; test with real sandbox actions through a cloudflared tunnel.

**Timing**
- Payout: item `SUCCEEDED` webhook ~30–45 s after Send now; batch `SUCCESS` a few seconds later.
- Invoice `CREATED` / `SENT` webhooks: ~10 s.
- `INVOICING.INVOICE.PAID` was **never generated** for a sandbox invoice that PayPal shows as `PAID` (checked with `GET /v1/notifications/webhooks-events`). Added a fallback: `checkInvoicePayment()` (a **Check payment** button on the deposit panel) and `syncSentInvoices()` (called by `/api/payouts/run-due` before payouts). Both settle through `markInvoicePaid()`, the same function the webhook uses, so effects are identical and a second path is a no-op.

**Changes from the plan's code**
- React drops `name`/`value` on a button whose `formAction` is a function: the approval queue's row buttons bind the payout id (`approveOne.bind(null, payout.id)`, same for `sendNow`).
- `buttonVariants()` used outside `<Button>` skipped tailwind-merge, so outline buttons lost their border; it now returns merged classes.
- The Audit log link sits under the campaign subtitle, not between breadcrumb and title.
- A file over the Server Action body limit (was 5 MB) crashed the page ("Body exceeded 5mb limit") before `checkUpload()` ran, and the broken page kept failing until reloaded. Now `<FileInput>` blocks files over 4 MB in the browser, and `bodySizeLimit` is 20 MB so a bypassed check still gets the "larger than 4 MB" notice.

**For Phase 3**
- Add `CRON_SECRET` to `.env` and to Render; the Render Cron Job calls `POST /api/payouts/run-due` with `Authorization: Bearer <CRON_SECRET>`.
- On deploy, point the PayPal webhook at the Render URL (no tunnel). Keep the Check payment fallback.
- After a failed check or hold, forms reset (redirect + notice), so the screenshot must be chosen again. Fine for now; revisit if it annoys in the demo.
