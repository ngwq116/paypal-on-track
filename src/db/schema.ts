import { pgTable, pgEnum, uuid, text, integer, boolean, date, timestamp, jsonb, customType } from "drizzle-orm/pg-core";
import type { ContractForm } from "@/lib/domain/contract";
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

export const contractStatus = pgEnum("contract_status", ["draft", "confirmed"]);

// R1–R3: the uploaded contract, what the AI read, and the campaign it created once confirmed.
export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  file: bytea("file").notNull(),
  extracted: jsonb("extracted").$type<ContractForm>().notNull(), // the AI reading, then the person's edits
  model: text("model").notNull(),
  status: contractStatus("status").notNull().default("draft"),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});
