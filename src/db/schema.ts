import { pgTable, pgEnum, uuid, text, integer, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core";

export const creatorType = pgEnum("creator_type", ["influencer", "freelancer"]);
export const assignmentStatus = pgEnum("assignment_status", ["scheduled", "submitted", "verified", "held", "paid"]);
export const payoutStatus = pgEnum("payout_status", ["awaiting_approval", "scheduled", "payout_sent", "paid", "payout_failed", "held"]);
export const invoiceKind = pgEnum("invoice_kind", ["deposit", "balance"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "sent", "paid"]);

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
  status: assignmentStatus("status").notNull().default("scheduled"),
});

export const clientInvoices = pgTable("client_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  kind: invoiceKind("kind").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  paypalInvoiceId: text("paypal_invoice_id"),
  status: invoiceStatus("status").notNull().default("draft"),
});

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id),
  amountCents: integer("amount_cents").notNull(),
  scheduledFor: date("scheduled_for", { mode: "string" }).notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paypalBatchId: text("paypal_batch_id"),
  status: payoutStatus("status").notNull().default("awaiting_approval"),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  actor: text("actor").notNull(), // user | agent | ai | paypal
  action: text("action").notNull(),
  detail: jsonb("detail").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
