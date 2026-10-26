# On-Track Phase 3: AI and Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude reads contracts and freelancer invoices, and the Team and Calendar views become live (colours, side panel, polling, drag to reschedule with a balance-invoice proposal), all running locally with PayPal webhooks through a tunnel.

**Architecture:** AI is a thin layer in `src/lib/ai/`: one helper sends a file to Claude with a JSON schema (structured outputs) and validates the reply with Zod. The AI only *reads*; every decision (invoice match, contract validity, payout guardrail) stays in the existing plain-code domain functions. Contracts are stored as drafts, reviewed in a client-side form with live totals, and confirmed by a transactional service. The views keep Plan B (one Bryntum product per route) and refresh their server data every 3 s; drags save through a Server Action and the server's dates always win. No hosting in this phase: the app runs locally and PayPal reaches it through the cloudflared tunnel. Hosting (Vercel) is an optional Phase 4 task.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `cacheComponents`), React 19, Drizzle + Postgres, Vitest, Bryntum Scheduler/Calendar 7.3.7 trial, `@anthropic-ai/sdk` (Claude Haiku 5.5, fallback Sonnet 5.5), Zod 4, `pdf-lib` (eval fixtures only), cloudflared tunnel for webhooks.

**Spec:** `docs/prd.html` (R1–R4, R11, R13, R14, R18, R19, Q7; demo script steps 1 and 5) and `docs/architecture.html` (sections 6.1, 6.4, 7, 10; its Render deploy in section 12 is dropped: no hosting this phase). Phase 2 notes at the end of `docs/superpowers/plans/2026-10-16-phase2-money-flows.md`.

## Global Constraints

- **Money is integer cents** everywhere. Amount strings are parsed only with `parseUsdToCents()`; PayPal strings only via `toPayPalValue()`.
- **Calendar dates are `YYYY-MM-DD` strings**, compared as strings. Date arithmetic only through `addDays()` / `daysBetween()` (UTC, no local timezone). The agency is UTC+8 (`agencyToday()`).
- **USD only. PayPal sandbox only** (`https://api-m.sandbox.paypal.com`).
- **No payout without `canPay()` returning `allow`**, at approval and right before `createPayout()`. Never call `createPayout()` outside `sendPayout()`.
- **Every payout needs a person's approval.** The AI only reads documents; it never approves, never sends money, and never decides a match.
- A payout can never exceed the contract fee. Moving a payout's date resets an approved payout to awaiting approval (R26).
- AI model: `claude-haiku-5-5` via `AI_MODEL` (fallback `claude-sonnet-5-5`). Structured outputs: `output_config: { format: { type: "json_schema", schema } }`; every object needs `additionalProperties: false`; no `minimum`/`maximum`/`minLength`/`maxLength` keywords.
- **Never commit `.env`** or print secrets. The repo is public. `git status` before every commit.
- UI follows the prototype: shadcn/ui, zinc greys, thin borders, no gradients or emoji, no modal dialogs (`alert`/`confirm`).
- One task = one commit; messages `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

## Review Focus

1. **An invoice or contract the AI can't read well** (scan, photo, odd layout): the person must get a clear "type it yourself" path, never a silent match. Pinned by `toInvoiceFields` tests (Task 2) and the `AiReadError` tests (Task 1).
2. **AI returns an amount with a currency code or symbol** (`USD 1,200.00`, `$1,200`): must still parse, and an unparseable amount must not become a match. Pinned by `toInvoiceFields` tests (Task 2).
3. **A drag onto a past day, or dropped back on the same day**: no change, the chip snaps back, no audit noise. Pinned by `planReschedule` tests (Task 8).
4. **The 3-second refresh firing during a drag**: the drag must not be lost. Paused by a ref; checked in the browser step of Task 8.
5. **Roster near-misses and duplicate names in a contract** (`Aina` vs `@aina.eats`, two creators with one name): never pick the wrong payee. Pinned by `matchRoster` tests (Task 4).

## File structure

| Path | Responsibility | Task |
|---|---|---|
| `src/lib/ai/client.ts` | Anthropic client from env, model name | 1 |
| `src/lib/ai/read-file.ts` | File → Claude content block; one structured-output call; `AiReadError` | 1 |
| `src/lib/ai/invoice-reader.ts` | Invoice JSON schema, `readInvoice`, `toInvoiceFields` | 2 |
| `src/components/SubmitButton.tsx` | Button that shows a pending label while its form submits | 2 |
| `eval/invoice-cases.ts`, `eval/contract-cases.ts`, `eval/files/*.pdf` | Eval set (Q7) | 3, 4 |
| `scripts/pdf-text.ts`, `scripts/make-eval-files.ts`, `scripts/eval.ts` | Generate fixture PDFs; run the eval | 3, 4 |
| `src/lib/domain/contract.ts` | Contract form types (Zod), validation, totals, roster match | 4 |
| `src/lib/ai/contract-reader.ts` | Contract JSON schema, `readContract` | 4 |
| `src/lib/services/contracts.ts` | Save draft, load draft, confirm → campaign (transaction) | 5 |
| `src/app/campaigns/new/*`, `src/app/contracts/[id]/*`, `src/components/ContractReview.tsx`, `src/app/api/contracts/[id]/file/route.ts` | Upload and review UI | 6 |
| `src/lib/events.ts`, `src/lib/load-timeline.ts` | Colours, overdue, side-panel content | 7 |
| `src/components/EventPanel.tsx`, `src/components/useAutoRefresh.ts` | Side panel; polling | 7 |
| `src/lib/domain/reschedule.ts`, `src/lib/services/reschedule.ts`, `src/app/campaigns/[id]/view-actions.ts`, `src/components/view-actor.ts` | Drag to reschedule | 8 |
| `src/lib/domain/balance.ts`, `src/lib/services/balance.ts`, `src/components/BalanceProposal.tsx` | Balance due-date proposal + PayPal update | 9 |

---

### Task 0: Before you start (15 min)

- [ ] **Step 1: Phase 2 is committed.** `git status` should show a clean tree (Phase 2 was one commit per task). If not, commit it first.
- [ ] **Step 2: Anthropic API key.** console.anthropic.com → API keys → create. Add to `.env` (never commit it):

```
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-haiku-5-5
```

- [ ] **Step 3: Tunnel ready.** `cloudflared` installed and the sandbox webhook registered (Phase 2, Task 7). Needed for the demo run-through in Task 10.

---

### Task 1: AI foundation: one file in, one validated JSON object out (45 min)

**Files:**
- Modify: `package.json` (dependencies)
- Create: `src/lib/ai/client.ts`, `src/lib/ai/read-file.ts`
- Test: `src/lib/ai/read-file.test.ts`

**Interfaces:**
- Consumes: `UploadedFile` (`src/lib/domain/upload.ts`).
- Produces:
  - `aiModel(): string`, `aiFromEnv(): AiClient`, `type AiClient` in `src/lib/ai/client.ts`
  - `class AiReadError extends Error`, `fileBlock(file: UploadedFile)`, `readFileAsJson<T>(ai: AiClient, input: { file: UploadedFile; instructions: string; jsonSchema: Record<string, unknown>; parse: ZodType<T>; maxTokens?: number }): Promise<{ data: T; model: string }>` in `src/lib/ai/read-file.ts`

- [ ] **Step 1: Install**

```bash
npm install @anthropic-ai/sdk zod
```

(`zod` 4 is already in `node_modules` through eslint; this makes it a direct dependency.)

- [ ] **Step 2: Write the failing tests**

Create `src/lib/ai/read-file.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AiClient } from "./client";
import { AiReadError, fileBlock, readFileAsJson } from "./read-file";

const pdf = { name: "a.pdf", type: "application/pdf", size: 3, bytes: Buffer.from("abc") };
const png = { ...pdf, name: "a.png", type: "image/png" };
const Schema = z.object({ amount: z.string() });
const JSON_SCHEMA = { type: "object", additionalProperties: false, required: ["amount"], properties: { amount: { type: "string" } } };

function fakeAi(reply: { text?: string; stop_reason?: string }) {
  const create = vi.fn();
  create.mockResolvedValue({
    model: "claude-haiku-5-5",
    stop_reason: reply.stop_reason ?? "end_turn",
    content: reply.text === undefined ? [] : [{ type: "text", text: reply.text }],
  });
  return { ai: { messages: { create } } as unknown as AiClient, create };
}
const ask = (ai: AiClient, file = pdf) => readFileAsJson(ai, { file, instructions: "Read it", jsonSchema: JSON_SCHEMA, parse: Schema });

afterEach(() => vi.unstubAllEnvs());

describe("fileBlock", () => {
  it("sends a PDF as a base64 document block and an image as an image block", () => {
    expect(fileBlock(pdf)).toEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "YWJj" } });
    expect(fileBlock(png)).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "YWJj" } });
  });
  it("refuses any other file type", () => {
    expect(() => fileBlock({ ...pdf, type: "image/svg+xml" })).toThrow(AiReadError);
  });
});

describe("readFileAsJson", () => {
  it("asks the AI_MODEL model for schema-shaped JSON and returns the validated object", async () => {
    vi.stubEnv("AI_MODEL", "claude-sonnet-5-5");
    const { ai, create } = fakeAi({ text: '{"amount":"1,200.00"}' });
    expect(await ask(ai)).toEqual({ data: { amount: "1,200.00" }, model: "claude-haiku-5-5" });
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-sonnet-5-5");
    expect(req.output_config).toEqual({ format: { type: "json_schema", schema: JSON_SCHEMA } });
    expect(req.messages[0].content.map((b: { type: string }) => b.type)).toEqual(["document", "text"]);
  });
  it("defaults to Claude Haiku 5.5", async () => {
    vi.stubEnv("AI_MODEL", "");
    const { ai, create } = fakeAi({ text: '{"amount":"1"}' });
    await ask(ai);
    expect(create.mock.calls[0][0].model).toBe("claude-haiku-5-5");
  });
  it("throws AiReadError when the reply is cut off, refused, not JSON, or the wrong shape", async () => {
    await expect(ask(fakeAi({ text: '{"amou', stop_reason: "max_tokens" }).ai)).rejects.toThrow("cut off");
    await expect(ask(fakeAi({ text: "", stop_reason: "refusal" }).ai)).rejects.toThrow("declined");
    await expect(ask(fakeAi({ text: "not json" }).ai)).rejects.toThrow("valid JSON");
    await expect(ask(fakeAi({ text: '{"total":1}' }).ai)).rejects.toThrow("expected fields");
    await expect(ask(fakeAi({}).ai)).rejects.toThrow(AiReadError);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/lib/ai/read-file.test.ts`
Expected: FAIL, `./read-file` not found.

- [ ] **Step 4: Implement**

Create `src/lib/ai/client.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-haiku-5-5"; // switch to claude-sonnet-5-5 with AI_MODEL, no code change (Q7)
export const aiModel = (): string => process.env.AI_MODEL || DEFAULT_MODEL;

// The slice of the SDK we use, so tests can pass a fake.
export type AiClient = Pick<Anthropic, "messages">;

let client: AiClient | null = null;

export function aiFromEnv(): AiClient {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY in .env");
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  return client;
}
```

Create `src/lib/ai/read-file.ts`:
```ts
import type Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import type { UploadedFile } from "@/lib/domain/upload";
import { aiModel, type AiClient } from "./client";

// A reading problem the person can act on ("type it yourself"), as opposed to a bug.
export class AiReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiReadError";
  }
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export function fileBlock(file: UploadedFile) {
  const data = file.bytes.toString("base64");
  if (file.type === "application/pdf") {
    return { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } };
  }
  if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { type: "image" as const, source: { type: "base64" as const, media_type: file.type as ImageType, data } };
  }
  throw new AiReadError(`Can't read ${file.type || "this"} files`);
}

// One file in, one JSON object out. The schema constrains Claude's output; Zod checks it again,
// because the rest of the app trusts these types.
export async function readFileAsJson<T>(
  ai: AiClient,
  input: { file: UploadedFile; instructions: string; jsonSchema: Record<string, unknown>; parse: ZodType<T>; maxTokens?: number },
): Promise<{ data: T; model: string }> {
  const res = await ai.messages.create({
    model: aiModel(),
    max_tokens: input.maxTokens ?? 2048,
    messages: [{ role: "user", content: [fileBlock(input.file), { type: "text", text: input.instructions }] }],
    output_config: { format: { type: "json_schema", schema: input.jsonSchema } },
  });

  const stop: string | null = res.stop_reason;
  if (stop === "max_tokens") throw new AiReadError("The AI reply was cut off");
  if (stop === "refusal") throw new AiReadError("The AI declined to read this file");

  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new AiReadError("The AI sent no answer");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiReadError("The AI reply wasn't valid JSON");
  }
  const parsed = input.parse.safeParse(json);
  if (!parsed.success) throw new AiReadError("The AI reply didn't have the expected fields");
  return { data: parsed.data, model: res.model };
}
```

If TypeScript rejects `output_config` (an old SDK), run `npm install @anthropic-ai/sdk@latest`; structured outputs are generally available, no beta header.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/ai/read-file.test.ts` → PASS. Then `npm test && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/ai
git status
git commit -m "feat: AI helper that reads one file into validated JSON"
```

---

### Task 2: Read a freelancer invoice with AI (R11) (60 min)

The AI fills the same fields staff type today; `compareInvoice()` still decides. The model never sees the contract, so it can't be nudged toward "match".

**Files:**
- Create: `src/lib/ai/invoice-reader.ts`, `src/components/SubmitButton.tsx`
- Modify: `src/lib/services/verification.ts` (`submitInvoice`: `currency`, `reader`)
- Modify: `src/lib/services/queries.ts` (`verificationLabel` shows AI reads)
- Modify: `src/app/campaigns/[id]/assignments/[assignmentId]/actions.ts` (`readInvoiceWithAi`)
- Modify: `src/components/InvoiceSection.tsx` (Read with AI button)
- Test: `src/lib/ai/invoice-reader.test.ts`, `src/lib/services/verification.int.test.ts`

**Interfaces:**
- Consumes: `readFileAsJson`, `AiReadError`, `aiFromEnv` (Task 1); `submitInvoice`, `checkUpload`, `INVOICE_TYPES`, `parseUsdToCents` (Phase 2).
- Produces:
  - `INVOICE_JSON_SCHEMA`, `InvoiceReadingSchema`, `type InvoiceReading`, `readInvoice(ai, file): Promise<{ data: InvoiceReading; model: string }>`, `toInvoiceFields(r: InvoiceReading): { ok: true; fields: { payee: string; paypalEmail: string; deliverable: string; currency: string; amount: string } } | { ok: false; reason: string }`, `MIN_CONFIDENCE = 0.5`
  - `submitInvoice` input gains `currency?: string` (default `"USD"`) and `reader?: { model: string; confidence: number }`
  - `<SubmitButton pending="Reading…" formAction? formNoValidate? className?>`

- [ ] **Step 1: Write the failing unit tests**

Create `src/lib/ai/invoice-reader.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "./client";
import { INVOICE_JSON_SCHEMA, InvoiceReadingSchema, readInvoice, toInvoiceFields } from "./invoice-reader";

const reading = { payee: "Daniel Lim", paypalEmail: "daniel@example.com", deliverable: "2 × 30s product video edits", currency: "usd", amount: "1,200.00", confidence: 0.9 };

describe("INVOICE_JSON_SCHEMA", () => {
  it("asks for exactly the fields Zod checks, with no extra properties", () => {
    expect([...INVOICE_JSON_SCHEMA.required].sort()).toEqual(Object.keys(InvoiceReadingSchema.shape).sort());
    expect(INVOICE_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("readInvoice", () => {
  it("sends the invoice file and returns the reading", async () => {
    const create = vi.fn();
    create.mockResolvedValue({ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reading) }] });
    const ai = { messages: { create } } as unknown as AiClient;
    const file = { name: "inv.pdf", type: "application/pdf", size: 3, bytes: Buffer.from("abc") };
    expect(await readInvoice(ai, file)).toEqual({ data: reading, model: "claude-haiku-5-5" });
    expect(create.mock.calls[0][0].output_config.format.schema).toBe(INVOICE_JSON_SCHEMA);
  });
});

describe("toInvoiceFields", () => {
  it("turns a confident reading into the invoice form fields", () => {
    expect(toInvoiceFields(reading)).toEqual({
      ok: true,
      fields: { payee: "Daniel Lim", paypalEmail: "daniel@example.com", deliverable: "2 × 30s product video edits", currency: "USD", amount: "1,200.00" },
    });
  });
  it("strips a currency code or symbol from the amount", () => {
    expect(toInvoiceFields({ ...reading, amount: "USD 1,200.00" })).toMatchObject({ ok: true, fields: { amount: "1,200.00" } });
    expect(toInvoiceFields({ ...reading, amount: "$1,200" })).toMatchObject({ ok: true, fields: { amount: "1,200" } });
  });
  it("sends staff to type it themselves when the AI is unsure or the amount is unreadable", () => {
    expect(toInvoiceFields({ ...reading, confidence: 0.3 })).toEqual({ ok: false, reason: "The AI wasn't sure it read this invoice correctly" });
    expect(toInvoiceFields({ ...reading, amount: "twelve hundred" })).toEqual({ ok: false, reason: "The AI couldn't read the amount" });
  });
});
```

Add to `src/lib/services/verification.int.test.ts` (import `verificationLabel` from `./queries`; `who`, `fields`, `pdf` already exist in this file):
```ts
describe("submitInvoice read by AI", () => {
  it("stores an AI verification with the model and confidence, and labels it", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    expect(await submitInvoice({ ...who, ...fields, assignmentId: assignment.id, file: pdf, reader: { model: "claude-haiku-5-5", confidence: 0.92 } })).toEqual({ ok: true });
    const [v] = await db.select().from(schema.verifications);
    expect(v).toMatchObject({ source: "ai", task: "invoice_match", pass: true });
    expect(v.checks).toMatchObject({ reader: { model: "claude-haiku-5-5", confidence: 0.92 } });
    expect(await verificationLabel(assignment.id)).toBe("Invoice matches (AI read) · Wanz");
  });
  it("holds an invoice billed in another currency", async () => {
    const { assignment } = await seedAssignment({ type: "freelancer" });
    await submitInvoice({ ...who, ...fields, currency: "MYR", assignmentId: assignment.id, file: pdf });
    expect((await assignmentRow(assignment.id)).status).toBe("held");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/ai/invoice-reader.test.ts` → FAIL (module not found). `npm run test:int` → the two new tests FAIL.

- [ ] **Step 3: Implement the reader**

Create `src/lib/ai/invoice-reader.ts`:
```ts
import { z } from "zod";
import { parseUsdToCents } from "@/lib/domain/money";
import type { UploadedFile } from "@/lib/domain/upload";
import type { AiClient } from "./client";
import { readFileAsJson } from "./read-file";

export const MIN_CONFIDENCE = 0.5;

export const InvoiceReadingSchema = z.object({
  payee: z.string(),
  paypalEmail: z.string(),
  deliverable: z.string(),
  currency: z.string(),
  amount: z.string(),
  confidence: z.number().min(0).max(1),
});
export type InvoiceReading = z.infer<typeof InvoiceReadingSchema>;

const str = (description: string) => ({ type: "string", description });

export const INVOICE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["payee", "paypalEmail", "deliverable", "currency", "amount", "confidence"],
  properties: {
    payee: str("Name of the person or business being paid, exactly as written"),
    paypalEmail: str("PayPal or payment email on the invoice, exactly as written; empty string if none"),
    deliverable: str("What the invoice charges for, copied from the line item description"),
    currency: str("ISO currency code of the total, e.g. USD or MYR"),
    amount: str("Total amount due, digits with optional thousands commas and 2 decimals, no currency, e.g. 1,200.00"),
    confidence: { type: "number", description: "0 to 1: how sure you are that every field was read correctly" },
  },
};

const INSTRUCTIONS = [
  "This is a freelancer's invoice to a marketing agency.",
  "Copy each field exactly as written: do not correct spelling, round amounts or guess.",
  "If a field is missing, return an empty string for it and lower your confidence.",
].join(" ");

export function readInvoice(ai: AiClient, file: UploadedFile) {
  return readFileAsJson(ai, { file, instructions: INSTRUCTIONS, jsonSchema: INVOICE_JSON_SCHEMA, parse: InvoiceReadingSchema, maxTokens: 1024 });
}

// The gate between the AI and the comparison: anything doubtful goes back to a person to type.
export function toInvoiceFields(
  r: InvoiceReading,
): { ok: true; fields: { payee: string; paypalEmail: string; deliverable: string; currency: string; amount: string } } | { ok: false; reason: string } {
  if (r.confidence < MIN_CONFIDENCE) return { ok: false, reason: "The AI wasn't sure it read this invoice correctly" };
  const amount = r.amount.trim().replace(/^[A-Za-z]{3}\s*/, "").replace(/^\$\s*/, "");
  if (parseUsdToCents(amount) === null) return { ok: false, reason: "The AI couldn't read the amount" };
  return {
    ok: true,
    fields: { payee: r.payee.trim(), paypalEmail: r.paypalEmail.trim(), deliverable: r.deliverable.trim(), currency: r.currency.trim().toUpperCase(), amount },
  };
}
```

- [ ] **Step 4: Record AI reads in the service**

In `src/lib/services/verification.ts`, `submitInvoice`:

1. Add to the input type:
```ts
  currency?: string; // what the invoice is billed in; staff-typed invoices are USD
  reader?: { model: string; confidence: number }; // set when the AI read the invoice
```
2. Replace `const invoice = { payee: input.payee, paypalEmail: input.paypalEmail, deliverable: input.deliverable, currency: "USD", amountCents };` with:
```ts
    const invoice = { payee: input.payee, paypalEmail: input.paypalEmail, deliverable: input.deliverable, currency: input.currency ?? "USD", amountCents };
```
3. In the `verifications` insert, replace `source: "user",` with `source: input.reader ? "ai" : "user",` and `checks: { fields: result.fields, invoice },` with:
```ts
      checks: { fields: result.fields, invoice, ...(input.reader ? { reader: input.reader } : {}) },
```
4. In the `writeAudit` detail, replace `detail: { assignmentId: assignment.id, mismatches: result.fields.filter((f) => !f.ok) },` with:
```ts
      detail: { assignmentId: assignment.id, mismatches: result.fields.filter((f) => !f.ok), ...(input.reader ? { readBy: input.reader.model, confidence: input.reader.confidence } : {}) },
```

In `src/lib/services/queries.ts`, `verificationLabel`: add `source: schema.verifications.source` to the select, and replace the return with:
```ts
  return v?.pass ? `${TASK_LABEL[v.task]}${v.source === "ai" ? " (AI read)" : ""} · ${v.createdBy}` : "Not verified";
```

Run: `npm run test:int` → PASS.

- [ ] **Step 5: The button and the action**

Create `src/components/SubmitButton.tsx`:
```tsx
"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Disables every button of the form while it submits, and relabels the one that was clicked.
export default function SubmitButton(props: {
  children: ReactNode;
  pending: string;
  className?: string;
  formAction?: (form: FormData) => void | Promise<void>;
  formNoValidate?: boolean;
}) {
  const status = useFormStatus();
  const mine = status.pending && (!props.formAction || status.action === props.formAction);
  return (
    <button className={props.className} formAction={props.formAction} formNoValidate={props.formNoValidate} disabled={status.pending}>
      {mine ? props.pending : props.children}
    </button>
  );
}
```

Add to `src/app/campaigns/[id]/assignments/[assignmentId]/actions.ts` (imports: `aiFromEnv` from `@/lib/ai/client`; `readInvoice`, `toInvoiceFields` from `@/lib/ai/invoice-reader`; `AiReadError` from `@/lib/ai/read-file`; `checkUpload`, `INVOICE_TYPES` from `@/lib/domain/upload`):
```ts
// R11: the AI fills the invoice fields; compareInvoice() inside submitInvoice still decides.
export async function readInvoiceWithAi(form: FormData) {
  const here = pageOf(form);
  const file = await fileFrom(form, "invoice");
  if (!file) backTo(here, "Upload the invoice");
  const fileError = checkUpload(file, INVOICE_TYPES);
  if (fileError) backTo(here, fileError);

  let reading: Awaited<ReturnType<typeof readInvoice>>;
  try {
    reading = await readInvoice(aiFromEnv(), file);
  } catch (err) {
    console.error("[ai] invoice read failed", err);
    backTo(here, `${err instanceof AiReadError ? err.message : "The AI couldn't be reached"}. Type the invoice fields instead.`);
  }
  const checked = toInvoiceFields(reading.data);
  if (!checked.ok) backTo(here, `${checked.reason}. Type the invoice fields instead.`);

  const r = await submitInvoice({
    assignmentId: text(form, "assignmentId"),
    file,
    ...checked.fields,
    actor: actorFrom(form),
    today: agencyToday(),
    reader: { model: reading.model, confidence: reading.data.confidence },
  });
  backTo(here, r.ok ? "Invoice read by AI and checked against the contract." : r.reason);
}
```

In `src/components/InvoiceSection.tsx` (import `readInvoiceWithAi` with the other actions, and `SubmitButton`):

1. Replace the hint paragraph with:
```tsx
          <p className="text-xs text-zinc-500">
            <strong className="font-medium text-zinc-700">Read with AI</strong> fills the fields from the file and checks them. Or type what the invoice says and click Check typed fields. Either way the comparison is On-Track&apos;s own rules.
          </p>
```
2. Replace `<button className={buttonVariants()}>Check against contract</button>` with:
```tsx
            <SubmitButton formAction={readInvoiceWithAi} formNoValidate pending="Reading…" className={buttonVariants()}>
              Read with AI
            </SubmitButton>
            <SubmitButton formAction={checkInvoice} pending="Checking…" className={buttonVariants({ variant: "outline" })}>
              Check typed fields
            </SubmitButton>
```

(`formNoValidate` lets the AI button submit with the typed fields empty; the server still checks the file. Both buttons name their action, so only the clicked one changes its label.)

- [ ] **Step 6: Check it in the browser**

`npm run db:seed`, `npm run dev`, Team view → Daniel Lim → **Invoice**. Generate a test invoice in Task 3, or use any PDF invoice addressed to Daniel Lim for $1,000.00.

Expected:
- **Read with AI** → "Reading…" for a few seconds → "Invoice read by AI and checked against the contract." and the comparison table.
- A $1,200 invoice → red "Payout held", Amount row "No". Approvals later shows "Invoice matches (AI read) · Wanz" for a matching one.
- Remove `ANTHROPIC_API_KEY` temporarily, restart → "The AI couldn't be reached. Type the invoice fields instead."; typing the fields still works.

- [ ] **Step 7: Commit**

```bash
npm test && npm run test:int && npm run build
git add src
git status
git commit -m "feat: read freelancer invoices with Claude; code still decides the match"
```

---

### Task 3: Invoice eval set and script (Q7) (60 min)

Ten generated invoices (5 correct, 5 mismatched) against one contract. Target from the PRD: **5 of 5 mismatches caught, 0 false holds**.

**Files:**
- Modify: `package.json` (scripts `eval:files`, `eval`; dev dependency `pdf-lib`)
- Create: `eval/invoice-cases.ts`, `scripts/pdf-text.ts`, `scripts/make-eval-files.ts`, `scripts/eval.ts`
- Create (generated, committed): `eval/files/invoice-*.pdf`

**Interfaces:**
- Consumes: `readInvoice`, `toInvoiceFields` (Task 2), `compareInvoice`, `ContractTerms` (Phase 2), `parseUsdToCents`.
- Produces: `textPdf(lines: string[]): Promise<Uint8Array>`; `EVAL_CONTRACT`, `INVOICE_CASES: InvoiceCase[]`; `npm run eval` (exit code 0 only when targets are met). Task 4 adds a contract section to the same script.

- [ ] **Step 1: Install and add scripts**

```bash
npm install -D pdf-lib
```

Add to `package.json` scripts:
```json
"eval:files": "tsx scripts/make-eval-files.ts",
"eval": "tsx --env-file=.env scripts/eval.ts"
```

- [ ] **Step 2: The PDF helper**

Create `scripts/pdf-text.ts`:
```ts
import { PDFDocument, StandardFonts } from "pdf-lib";

// A plain one-column PDF: "# " lines are bold headings. Enough to look like a simple invoice or contract.
export async function textPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  for (const raw of lines) {
    const heading = raw.startsWith("# ");
    const text = heading ? raw.slice(2) : raw;
    if (y < 60) {
      page = doc.addPage([595, 842]);
      y = 790;
    }
    if (text) page.drawText(text, { x: 56, y, size: heading ? 14 : 10.5, font: heading ? bold : font });
    y -= heading ? 24 : 16;
  }
  return doc.save();
}
```

- [ ] **Step 3: The cases**

Create `eval/invoice-cases.ts`:
```ts
import type { ContractTerms } from "../src/lib/domain/invoice-match";

// The contract every eval invoice is checked against (matches the seed's Daniel Lim, with a fixed email).
export const EVAL_CONTRACT: ContractTerms = {
  payee: "Daniel Lim",
  paypalEmail: "daniel.lim@example.com",
  deliverable: "2 × 30s product video edits",
  currency: "USD",
  feeCents: 100000,
};

export interface InvoiceCase {
  id: string;
  expectMatch: boolean;
  note: string;
  lines: string[];
}

const top = (no: string) => [`# INVOICE ${no}`, "Date: 25 October 2026", "Bill to: Studio Rakan Sdn Bhd, Kuala Lumpur", ""];

export const INVOICE_CASES: InvoiceCase[] = [
  {
    id: "ok-plain",
    expectMatch: true,
    note: "clean single line",
    lines: [...top("INV-0142"), "From: Daniel Lim", "PayPal: daniel.lim@example.com", "", "Description: 2 × 30s product video edits", "Amount: USD 1,000.00", "", "Total due: USD 1,000.00"],
  },
  {
    id: "ok-symbol",
    expectMatch: true,
    note: "dollar sign, no decimals",
    lines: [...top("0143"), "Payee: Daniel Lim", "", "Item                                   Qty   Price", "2 × 30s product video edits            1     $1000", "", "TOTAL  $1000", "", "Please pay via PayPal to daniel.lim@example.com"],
  },
  {
    id: "ok-subtotal",
    expectMatch: true,
    note: "subtotal and zero tax",
    lines: [...top("DL-2026-11"), "Daniel Lim · Video editor", "daniel.lim@example.com", "", "1. 2 × 30s product video edits ........ 1,000.00", "", "Subtotal: 1,000.00", "Tax (0%): 0.00", "Amount payable (USD): 1,000.00"],
  },
  {
    id: "ok-footer-email",
    expectMatch: true,
    note: "email only in the footer",
    lines: [...top("144"), "Freelancer: Daniel Lim", "Currency: USD", "", "Work: 2 × 30s product video edits", "Fee: 1,000.00", "", "", "", "Payment details: PayPal account daniel.lim@example.com"],
  },
  {
    id: "ok-terms",
    expectMatch: true,
    note: "payment terms and notes around the numbers",
    lines: [...top("INV-145"), "Issued by Daniel Lim (daniel.lim@example.com)", "Terms: due within 7 days", "", "Services rendered:", "  2 × 30s product video edits for Kopi Kita Pagi Launch", "", "Grand total: USD 1,000.00", "Thank you!"],
  },
  {
    id: "bad-amount",
    expectMatch: false,
    note: "invoices $1,200 on a $1,000 contract",
    lines: [...top("INV-0146"), "From: Daniel Lim", "PayPal: daniel.lim@example.com", "", "Description: 2 × 30s product video edits", "Amount: USD 1,200.00", "", "Total due: USD 1,200.00"],
  },
  {
    id: "bad-email",
    expectMatch: false,
    note: "asks to be paid to a different PayPal account",
    lines: [...top("INV-0147"), "From: Daniel Lim", "PayPal: daniel.lim88@example.com", "", "Description: 2 × 30s product video edits", "Total due: USD 1,000.00"],
  },
  {
    id: "bad-deliverable",
    expectMatch: false,
    note: "bills for three edits instead of two",
    lines: [...top("INV-0148"), "From: Daniel Lim", "PayPal: daniel.lim@example.com", "", "Description: 3 × 30s product video edits", "Total due: USD 1,000.00"],
  },
  {
    id: "bad-currency",
    expectMatch: false,
    note: "billed in ringgit",
    lines: [...top("INV-0149"), "From: Daniel Lim", "PayPal: daniel.lim@example.com", "", "Description: 2 × 30s product video edits", "Total due: MYR 1,000.00"],
  },
  {
    id: "bad-payee",
    expectMatch: false,
    note: "a different person",
    lines: [...top("INV-0150"), "From: Danial Lin", "PayPal: daniel.lim@example.com", "", "Description: 2 × 30s product video edits", "Total due: USD 1,000.00"],
  },
];
```

- [ ] **Step 4: Generate the files**

Create `scripts/make-eval-files.ts`:
```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { INVOICE_CASES } from "../eval/invoice-cases";
import { textPdf } from "./pdf-text";

async function main() {
  mkdirSync("eval/files", { recursive: true });
  for (const c of INVOICE_CASES) writeFileSync(`eval/files/invoice-${c.id}.pdf`, await textPdf(c.lines));
  console.log(`Wrote ${INVOICE_CASES.length} invoices to eval/files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run: `npm run eval:files` → "Wrote 10 invoices". Open one PDF to check it looks like an invoice.

- [ ] **Step 5: The eval script**

Create `scripts/eval.ts`:
```ts
import { readFileSync } from "node:fs";
import { aiFromEnv, aiModel } from "../src/lib/ai/client";
import { readInvoice, toInvoiceFields } from "../src/lib/ai/invoice-reader";
import { compareInvoice } from "../src/lib/domain/invoice-match";
import { parseUsdToCents } from "../src/lib/domain/money";
import { EVAL_CONTRACT, INVOICE_CASES } from "../eval/invoice-cases";

export function pdfFile(path: string) {
  const bytes = readFileSync(path);
  return { name: path.split("/").pop() ?? "file.pdf", type: "application/pdf", size: bytes.length, bytes };
}

// Same path as the app: AI reads, toInvoiceFields gates, compareInvoice decides. A gate refusal counts as a hold.
async function evalInvoices(): Promise<boolean> {
  const ai = aiFromEnv();
  let caught = 0;
  let falseHolds = 0;
  for (const c of INVOICE_CASES) {
    let match = false;
    let detail = "";
    try {
      const { data } = await readInvoice(ai, pdfFile(`eval/files/invoice-${c.id}.pdf`));
      const checked = toInvoiceFields(data);
      if (!checked.ok) detail = checked.reason;
      else {
        const result = compareInvoice(EVAL_CONTRACT, { ...checked.fields, amountCents: parseUsdToCents(checked.fields.amount) ?? 0 });
        match = result.match;
        detail = result.fields.filter((f) => !f.ok).map((f) => `${f.label}: ${f.invoice}`).join("; ");
      }
    } catch (err) {
      detail = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (!c.expectMatch && !match) caught++;
    if (c.expectMatch && !match) falseHolds++;
    const verdict = match === c.expectMatch ? "PASS" : "FAIL";
    console.log(`${verdict}  ${c.id.padEnd(16)} expected ${c.expectMatch ? "match" : "hold "}  got ${match ? "match" : "hold "}  ${detail}`);
  }
  const bad = INVOICE_CASES.filter((c) => !c.expectMatch).length;
  const good = INVOICE_CASES.length - bad;
  console.log(`\nInvoices (${aiModel()}): mismatches caught ${caught}/${bad} (target ${bad}/${bad}), false holds ${falseHolds}/${good} (target 0)\n`);
  return caught === bad && falseHolds === 0;
}

async function main() {
  const invoicesOk = await evalInvoices();
  process.exit(invoicesOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Run it**

Run: `npm run eval`
Expected: 10 PASS lines, "mismatches caught 5/5 … false holds 0/5". Costs a fraction of a cent.

If a case fails: read the `detail`. A false hold on a correct invoice usually means the instructions need a tweak (e.g. the model normalised "×" to "x": `compareInvoice` already treats those as equal; a changed word is a real problem). Change `INSTRUCTIONS` in `invoice-reader.ts`, rerun. If Haiku can't reach the target after two tweaks, set `AI_MODEL=claude-sonnet-5-5`, rerun, and note it for the Phase 3 notes. **Don't edit the cases to make them pass.**

- [ ] **Step 7: Commit**

```bash
npm test && npm run build
git add package.json package-lock.json eval scripts/pdf-text.ts scripts/make-eval-files.ts scripts/eval.ts
git status
git commit -m "test: invoice eval set and script against the PRD accuracy targets"
```

---

### Task 4: Contract terms: validation rules and the AI reader (R1, R2, R4) (75 min)

**Files:**
- Modify: `src/lib/domain/format.ts` (`isDay`)
- Create: `src/lib/domain/contract.ts`, `src/lib/ai/contract-reader.ts`, `eval/contract-cases.ts`
- Modify: `scripts/make-eval-files.ts`, `scripts/eval.ts` (contract section)
- Test: `src/lib/domain/contract.test.ts`, `src/lib/ai/contract-reader.test.ts`

**Interfaces:**
- Consumes: `parseUsdToCents`, `PostBrief`, `readFileAsJson` (Task 1), `textPdf` (Task 3).
- Produces (in `src/lib/domain/contract.ts`):
  - `CreatorLineSchema`, `ContractFormSchema`, `ContractReadingSchema` (Zod); `type CreatorLine`, `type ContractForm`, `type ContractReading`
  - `interface CampaignTerms { campaignName; clientName; clientEmail; startDate; endDate; totalCents; depositCents; depositDueDate; balanceCents; balanceDueDate; creators: Array<{ creatorId: string | null; name; type; detail; paypalEmail; deliverable; feeCents; dueDate; payoutDate; brief: PostBrief | null }> }`
  - `parseContractForm(f: ContractForm): { ok: true; terms: CampaignTerms } | { ok: false; errors: string[] }`
  - `contractTotals(f: ContractForm): { totalCents: number | null; creatorCents: number; marginCents: number | null; splitOk: boolean }`
  - `matchRoster(name: string, roster: Array<{ id: string; name: string }>): string` (roster id or `""`)
  - `type RosterCreator = { id: string; name: string; type: "influencer" | "freelancer"; detail: string; paypalEmail: string }`
  - `formFromReading(reading: ContractReading, roster: RosterCreator[]): ContractForm`
- Produces: `isDay(s: string): boolean` in `src/lib/domain/format.ts`; `CONTRACT_JSON_SCHEMA`, `readContract(ai, file)` in `src/lib/ai/contract-reader.ts`; `CONTRACT_CASES` in `eval/contract-cases.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/contract.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isDay } from "./format";
import { contractTotals, formFromReading, matchRoster, parseContractForm, type ContractForm } from "./contract";

const form = (): ContractForm => ({
  campaignName: "Teh Tarik · Raya Push",
  clientName: "Teh Tarik Co",
  clientEmail: "billing@tehtarik.example",
  startDate: "2026-11-02",
  endDate: "2026-11-30",
  totalFee: "8,000.00",
  depositAmount: "4,000.00",
  depositDueDate: "2026-11-02",
  balanceAmount: "4,000.00",
  balanceDueDate: "2026-11-30",
  creators: [
    {
      creatorId: "",
      name: "@sara.sips",
      type: "influencer",
      detail: "Instagram",
      paypalEmail: "sara@example.com",
      deliverable: "1 Reel",
      fee: "2,500.00",
      dueDate: "2026-11-10",
      payoutDate: "2026-11-13",
      brandTag: "@tehtarikco",
      hashtags: "#RayaWithTehTarik ad",
      windowStart: "2026-11-09",
      windowEnd: "2026-11-11",
    },
    {
      creatorId: "c-lina",
      name: "Lina Ho",
      type: "freelancer",
      detail: "Photography",
      paypalEmail: "lina@example.com",
      deliverable: "10 product photos",
      fee: "1,500",
      dueDate: "2026-11-06",
      payoutDate: "2026-11-09",
      brandTag: "",
      hashtags: "",
      windowStart: "",
      windowEnd: "",
    },
  ],
});

describe("isDay", () => {
  it("accepts real YYYY-MM-DD days only", () => {
    expect(isDay("2026-11-30")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("30/11/2026")).toBe(false);
    expect(isDay("")).toBe(false);
  });
});

describe("parseContractForm", () => {
  it("turns the reviewed form into cents, briefs and roster ids", () => {
    const r = parseContractForm(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.terms).toMatchObject({ totalCents: 800000, depositCents: 400000, balanceCents: 400000 });
    expect(r.terms.creators[0]).toMatchObject({
      creatorId: null,
      feeCents: 250000,
      brief: { brandTag: "@tehtarikco", hashtags: ["#RayaWithTehTarik", "#ad"], windowStart: "2026-11-09", windowEnd: "2026-11-11" },
    });
    expect(r.terms.creators[1]).toMatchObject({ creatorId: "c-lina", feeCents: 150000, brief: null });
  });
  it("requires deposit + balance to equal the total", () => {
    expect(parseContractForm({ ...form(), depositAmount: "3,000.00" })).toEqual({ ok: false, errors: ["Deposit and balance must add up to the total fee"] });
  });
  it("names the creator and field for each problem", () => {
    const f = form();
    f.creators[0] = { ...f.creators[0], paypalEmail: "sara", payoutDate: "2026-11-01", windowEnd: "2026-11-01" };
    f.creators[1] = { ...f.creators[1], fee: "1.234" };
    const r = parseContractForm(f);
    expect(r).toEqual({
      ok: false,
      errors: [
        "Creator 1 (@sara.sips): PayPal email must be an email address",
        "Creator 1 (@sara.sips): payout date is before the due date",
        "Creator 1 (@sara.sips): posting window ends before it starts",
        "Creator 2 (Lina Ho): fee must be an amount like 1,200.00",
      ],
    });
  });
  it("needs at least one creator and real dates", () => {
    const r = parseContractForm({ ...form(), creators: [], endDate: "2026-10-01" });
    expect(r).toEqual({ ok: false, errors: ["End date is before the start date", "Add at least one creator"] });
  });
});

describe("contractTotals", () => {
  it("adds up creator fees and the agency margin as the form changes", () => {
    expect(contractTotals(form())).toEqual({ totalCents: 800000, creatorCents: 400000, marginCents: 400000, splitOk: true });
    expect(contractTotals({ ...form(), totalFee: "", depositAmount: "1" })).toEqual({ totalCents: null, creatorCents: 400000, marginCents: null, splitOk: false });
  });
});

describe("matchRoster", () => {
  const roster = [
    { id: "1", name: "@aina.eats" },
    { id: "2", name: "Daniel Lim" },
    { id: "3", name: "Sam Lee" },
    { id: "4", name: "sam lee" },
  ];
  it("matches the exact name, ignoring case and spaces", () => {
    expect(matchRoster(" daniel lim ", roster)).toBe("2");
  });
  it("never guesses: a partial name or two people with the same name match nobody", () => {
    expect(matchRoster("Aina", roster)).toBe("");
    expect(matchRoster("Sam Lee", roster)).toBe("");
    expect(matchRoster("", roster)).toBe("");
  });
});

describe("formFromReading", () => {
  it("links roster creators and takes their payout details from the roster", () => {
    const { creators, ...rest } = form();
    const reading = { ...rest, creators: creators.map(({ creatorId: _, ...c }) => c) };
    const roster = [{ id: "r1", name: "Lina Ho", type: "freelancer" as const, detail: "Photos", paypalEmail: "lina.real@example.com" }];
    const f = formFromReading(reading, roster);
    expect(f.creators[0].creatorId).toBe("");
    expect(f.creators[1]).toMatchObject({ creatorId: "r1", paypalEmail: "lina.real@example.com", detail: "Photos" });
  });
});
```

Create `src/lib/ai/contract-reader.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ContractReadingSchema, CreatorLineSchema } from "@/lib/domain/contract";
import { CONTRACT_JSON_SCHEMA } from "./contract-reader";

describe("CONTRACT_JSON_SCHEMA", () => {
  it("asks for exactly the fields Zod checks, at both levels, with no extra properties", () => {
    expect([...CONTRACT_JSON_SCHEMA.required].sort()).toEqual(Object.keys(ContractReadingSchema.shape).sort());
    const item = CONTRACT_JSON_SCHEMA.properties.creators.items;
    expect([...item.required].sort()).toEqual(Object.keys(CreatorLineSchema.omit({ creatorId: true }).shape).sort());
    expect(CONTRACT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(item.additionalProperties).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/domain/contract.test.ts src/lib/ai/contract-reader.test.ts` → FAIL (modules not found).

- [ ] **Step 3: Implement the domain**

Add to `src/lib/domain/format.ts`:
```ts
// "2026-10-19" and a real calendar day (no Feb 30). Uses Date only to validate, in UTC.
export function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
```

Create `src/lib/domain/contract.ts`:
```ts
import { z } from "zod";
import { isDay } from "./format";
import { parseUsdToCents } from "./money";
import type { PostBrief } from "./types";

// The review form edits strings exactly as typed (or as the AI read them); parseContractForm turns them into terms.
export const CreatorLineSchema = z.object({
  creatorId: z.string(), // roster id, or "" for a new creator
  name: z.string(),
  type: z.enum(["influencer", "freelancer"]),
  detail: z.string(),
  paypalEmail: z.string(),
  deliverable: z.string(),
  fee: z.string(),
  dueDate: z.string(),
  payoutDate: z.string(),
  brandTag: z.string(),
  hashtags: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
});

export const ContractFormSchema = z.object({
  campaignName: z.string(),
  clientName: z.string(),
  clientEmail: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  totalFee: z.string(),
  depositAmount: z.string(),
  depositDueDate: z.string(),
  balanceAmount: z.string(),
  balanceDueDate: z.string(),
  creators: z.array(CreatorLineSchema),
});

// What the AI returns: the same, without roster ids.
export const ContractReadingSchema = ContractFormSchema.extend({ creators: z.array(CreatorLineSchema.omit({ creatorId: true })) });

export type CreatorLine = z.infer<typeof CreatorLineSchema>;
export type ContractForm = z.infer<typeof ContractFormSchema>;
export type ContractReading = z.infer<typeof ContractReadingSchema>;
export type RosterCreator = { id: string; name: string; type: "influencer" | "freelancer"; detail: string; paypalEmail: string };

export interface CampaignTerms {
  campaignName: string;
  clientName: string;
  clientEmail: string;
  startDate: string;
  endDate: string;
  totalCents: number;
  depositCents: number;
  depositDueDate: string;
  balanceCents: number;
  balanceDueDate: string;
  creators: Array<{
    creatorId: string | null;
    name: string;
    type: "influencer" | "freelancer";
    detail: string;
    paypalEmail: string;
    deliverable: string;
    feeCents: number;
    dueDate: string;
    payoutDate: string;
    brief: PostBrief | null;
  }>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// R4: only an exact name match (ignoring case and spaces) links a roster creator. Never guess a payee.
export function matchRoster(name: string, roster: Array<{ id: string; name: string }>): string {
  const key = name.trim().toLowerCase();
  const hits = roster.filter((r) => r.name.trim().toLowerCase() === key);
  return key && hits.length === 1 ? hits[0].id : "";
}

// A linked roster creator keeps the roster's payout details: the roster, not the PDF, decides where money goes.
export function formFromReading(reading: ContractReading, roster: RosterCreator[]): ContractForm {
  return {
    ...reading,
    creators: reading.creators.map((c) => {
      const r = roster.find((x) => x.id === matchRoster(c.name, roster));
      return r ? { ...c, creatorId: r.id, name: r.name, type: r.type, detail: r.detail, paypalEmail: r.paypalEmail } : { ...c, creatorId: "" };
    }),
  };
}

// R2: live numbers for the review form.
export function contractTotals(f: ContractForm) {
  const totalCents = parseUsdToCents(f.totalFee);
  const deposit = parseUsdToCents(f.depositAmount);
  const balance = parseUsdToCents(f.balanceAmount);
  const creatorCents = f.creators.reduce((sum, c) => sum + (parseUsdToCents(c.fee) ?? 0), 0);
  return {
    totalCents,
    creatorCents,
    marginCents: totalCents === null ? null : totalCents - creatorCents,
    splitOk: totalCents !== null && deposit !== null && balance !== null && deposit + balance === totalCents,
  };
}

export function parseContractForm(f: ContractForm): { ok: true; terms: CampaignTerms } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const need = (v: string, label: string) => {
    if (!v.trim()) errors.push(`${label} is required`);
  };
  const day = (v: string, label: string) => {
    if (!isDay(v)) errors.push(`${label} must be a date`);
  };
  const money = (v: string, label: string): number => {
    const cents = parseUsdToCents(v);
    if (cents === null) errors.push(`${label} must be an amount like 1,200.00`);
    return cents ?? 0;
  };
  const ordered = (a: string, b: string, message: string) => {
    if (isDay(a) && isDay(b) && b < a) errors.push(message);
  };

  need(f.campaignName, "Campaign name");
  need(f.clientName, "Client name");
  if (!EMAIL.test(f.clientEmail.trim())) errors.push("Client email must be an email address");
  day(f.startDate, "Start date");
  day(f.endDate, "End date");
  ordered(f.startDate, f.endDate, "End date is before the start date");
  const totalCents = money(f.totalFee, "Total fee");
  const depositCents = money(f.depositAmount, "Deposit");
  const balanceCents = money(f.balanceAmount, "Balance");
  day(f.depositDueDate, "Deposit due date");
  day(f.balanceDueDate, "Balance due date");
  if (totalCents && depositCents && balanceCents && depositCents + balanceCents !== totalCents) {
    errors.push("Deposit and balance must add up to the total fee");
  }
  if (f.creators.length === 0) errors.push("Add at least one creator");

  const creators = f.creators.map((c, i) => {
    const who = `Creator ${i + 1}${c.name.trim() ? ` (${c.name.trim()})` : ""}`;
    need(c.name, `${who}: name`);
    need(c.deliverable, `${who}: deliverable`);
    if (!EMAIL.test(c.paypalEmail.trim())) errors.push(`${who}: PayPal email must be an email address`);
    const feeCents = money(c.fee, `${who}: fee`);
    day(c.dueDate, `${who}: due date`);
    day(c.payoutDate, `${who}: payout date`);
    ordered(c.dueDate, c.payoutDate, `${who}: payout date is before the due date`);
    let brief: PostBrief | null = null;
    if (c.type === "influencer") {
      const hashtags = c.hashtags
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((h) => (h.startsWith("#") ? h : `#${h}`));
      need(c.brandTag, `${who}: brand tag`);
      if (!hashtags.length) errors.push(`${who}: add at least one hashtag`);
      day(c.windowStart, `${who}: posting window start`);
      day(c.windowEnd, `${who}: posting window end`);
      ordered(c.windowStart, c.windowEnd, `${who}: posting window ends before it starts`);
      brief = { brandTag: c.brandTag.trim(), hashtags, windowStart: c.windowStart, windowEnd: c.windowEnd };
    }
    return {
      creatorId: c.creatorId || null,
      name: c.name.trim(),
      type: c.type,
      detail: c.detail.trim(),
      paypalEmail: c.paypalEmail.trim(),
      deliverable: c.deliverable.trim(),
      feeCents,
      dueDate: c.dueDate,
      payoutDate: c.payoutDate,
      brief,
    };
  });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    terms: {
      campaignName: f.campaignName.trim(),
      clientName: f.clientName.trim(),
      clientEmail: f.clientEmail.trim(),
      startDate: f.startDate,
      endDate: f.endDate,
      totalCents,
      depositCents,
      depositDueDate: f.depositDueDate,
      balanceCents,
      balanceDueDate: f.balanceDueDate,
      creators,
    },
  };
}
```

- [ ] **Step 4: Implement the reader**

Create `src/lib/ai/contract-reader.ts`:
```ts
import { ContractReadingSchema } from "@/lib/domain/contract";
import type { UploadedFile } from "@/lib/domain/upload";
import type { AiClient } from "./client";
import { readFileAsJson } from "./read-file";

const str = (description: string) => ({ type: "string", description });
const day = (what: string) => str(`${what} as YYYY-MM-DD; empty string if not stated`);
const money = (what: string) => str(`${what}: digits with thousands commas and 2 decimals, no currency, e.g. 12,000.00`);

export const CONTRACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["campaignName", "clientName", "clientEmail", "startDate", "endDate", "totalFee", "depositAmount", "depositDueDate", "balanceAmount", "balanceDueDate", "creators"],
  properties: {
    campaignName: str("Campaign name exactly as written"),
    clientName: str("Client company name (the brand paying the agency)"),
    clientEmail: str("Client billing email; empty string if none"),
    startDate: day("Campaign start date"),
    endDate: day("Campaign end date"),
    totalFee: money("Total fee the client pays the agency"),
    depositAmount: money("Deposit amount"),
    depositDueDate: day("Deposit due date"),
    balanceAmount: money("Balance amount"),
    balanceDueDate: day("Balance due date"),
    creators: {
      type: "array",
      description: "Every influencer and freelancer named in the contract, in order",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type", "detail", "paypalEmail", "deliverable", "fee", "dueDate", "payoutDate", "brandTag", "hashtags", "windowStart", "windowEnd"],
        properties: {
          name: str("Influencer handle or freelancer name exactly as written, e.g. @aina.eats or Daniel Lim"),
          type: { type: "string", enum: ["influencer", "freelancer"] },
          detail: str("Platform for an influencer (e.g. Instagram, TikTok) or the service for a freelancer (e.g. Video edits)"),
          paypalEmail: str("The creator's PayPal email; empty string if none"),
          deliverable: str("The deliverable exactly as written, e.g. 1 Reel + 2 Stories"),
          fee: money("The creator's fee"),
          dueDate: day("Delivery or posting due date"),
          payoutDate: day("Date the creator is paid"),
          brandTag: str("Brand handle the post must tag, e.g. @kopikita; empty string for freelancers"),
          hashtags: str("Required hashtags separated by spaces, e.g. #KopiKitaPagi #ad; empty string for freelancers"),
          windowStart: day("First day the post may go live; empty string for freelancers"),
          windowEnd: day("Last day the post may go live; empty string for freelancers"),
        },
      },
    },
  },
};

const INSTRUCTIONS = [
  "This is a signed services agreement between a marketing agency and its client.",
  "Extract the campaign terms. Copy names, handles, emails and deliverables exactly as written.",
  "Convert every date to YYYY-MM-DD. Do not invent anything that is not in the document: use an empty string instead.",
].join(" ");

export function readContract(ai: AiClient, file: UploadedFile) {
  return readFileAsJson(ai, { file, instructions: INSTRUCTIONS, jsonSchema: CONTRACT_JSON_SCHEMA, parse: ContractReadingSchema, maxTokens: 4096 });
}
```

Run: `npx vitest run src/lib/domain/contract.test.ts src/lib/ai/contract-reader.test.ts` → PASS.

- [ ] **Step 5: Contract eval cases**

Create `eval/contract-cases.ts`:
```ts
import type { ContractReading } from "../src/lib/domain/contract";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// "2026-10-19" → "19 October 2026": contracts are written for people, the AI must convert back.
const long = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
};

// One template for every demo contract (the PRD allows a single template).
export function contractLines(c: ContractReading): string[] {
  const lines = [
    "# SERVICES AGREEMENT",
    "Agency: Studio Rakan Sdn Bhd, Kuala Lumpur",
    `Client: ${c.clientName} (billing email: ${c.clientEmail})`,
    `Campaign: ${c.campaignName}`,
    `Campaign period: ${long(c.startDate)} to ${long(c.endDate)}`,
    "",
    "# 1. Fees and payment",
    `Total fee: USD ${c.totalFee}`,
    `Deposit: USD ${c.depositAmount}, due ${long(c.depositDueDate)}`,
    `Balance: USD ${c.balanceAmount}, due ${long(c.balanceDueDate)}`,
    "",
    "# 2. Creators and deliverables",
  ];
  c.creators.forEach((cr, i) => {
    lines.push(
      `2.${i + 1} ${cr.name} (${cr.type}, ${cr.detail})`,
      `      PayPal: ${cr.paypalEmail}`,
      `      Deliverable: ${cr.deliverable}`,
      `      Fee: USD ${cr.fee}`,
      `      Delivery due ${long(cr.dueDate)}; paid on ${long(cr.payoutDate)}`,
    );
    if (cr.type === "influencer") {
      lines.push(`      Brief: tag ${cr.brandTag}; hashtags ${cr.hashtags}; post between ${long(cr.windowStart)} and ${long(cr.windowEnd)}`);
    }
    lines.push("");
  });
  lines.push("# 3. Signatures", "Signed for the Agency: ____________    Signed for the Client: ____________");
  return lines;
}

const influencer = (name: string, detail: string, email: string, deliverable: string, fee: string, due: string, pay: string, tag: string, hashtags: string, from: string, to: string) => ({
  name, type: "influencer" as const, detail, paypalEmail: email, deliverable, fee, dueDate: due, payoutDate: pay, brandTag: tag, hashtags, windowStart: from, windowEnd: to,
});
const freelancer = (name: string, detail: string, email: string, deliverable: string, fee: string, due: string, pay: string) => ({
  name, type: "freelancer" as const, detail, paypalEmail: email, deliverable, fee, dueDate: due, payoutDate: pay, brandTag: "", hashtags: "", windowStart: "", windowEnd: "",
});

export const CONTRACT_CASES: Array<{ id: string; expected: ContractReading }> = [
  {
    id: "kopi-kita", // the demo campaign: names match the seed roster
    expected: {
      campaignName: "Kopi Kita · Pagi Launch",
      clientName: "Kopi Kita Sdn Bhd",
      clientEmail: "finance@kopikita.example",
      startDate: "2026-10-19",
      endDate: "2026-11-20",
      totalFee: "12,000.00",
      depositAmount: "6,000.00",
      depositDueDate: "2026-10-19",
      balanceAmount: "6,000.00",
      balanceDueDate: "2026-11-20",
      creators: [
        influencer("@aina.eats", "Instagram", "aina@example.com", "1 Reel + 2 Stories", "1,500.00", "2026-10-21", "2026-10-23", "@kopikita", "#KopiKitaPagi #ad", "2026-10-20", "2026-10-22"),
        influencer("@jasonlifts", "TikTok", "jason@example.com", "1 TikTok video", "1,200.00", "2026-10-24", "2026-10-29", "@kopikita", "#KopiKitaPagi #ad", "2026-10-23", "2026-10-25"),
        influencer("@mira.travels", "Instagram", "mira@example.com", "1 Reel", "2,000.00", "2026-10-28", "2026-10-30", "@kopikita", "#KopiKitaPagi #ad", "2026-10-27", "2026-10-29"),
        freelancer("Daniel Lim", "Video edits", "daniel.lim@example.com", "2 × 30s product video edits", "1,000.00", "2026-10-27", "2026-10-31"),
      ],
    },
  },
  {
    id: "teh-tarik",
    expected: {
      campaignName: "Teh Tarik · Raya Push",
      clientName: "Teh Tarik Co",
      clientEmail: "billing@tehtarik.example",
      startDate: "2026-11-02",
      endDate: "2026-11-30",
      totalFee: "8,000.00",
      depositAmount: "4,000.00",
      depositDueDate: "2026-11-02",
      balanceAmount: "4,000.00",
      balanceDueDate: "2026-11-30",
      creators: [
        influencer("@sara.sips", "Instagram", "sara@example.com", "1 Reel", "2,500.00", "2026-11-10", "2026-11-13", "@tehtarikco", "#RayaWithTehTarik #ad", "2026-11-09", "2026-11-11"),
        freelancer("Lina Ho", "Photography", "lina@example.com", "10 product photos", "1,500.00", "2026-11-06", "2026-11-09"),
      ],
    },
  },
  {
    id: "glowlab",
    expected: {
      campaignName: "GlowLab · Serum Launch",
      clientName: "GlowLab Beauty Sdn Bhd",
      clientEmail: "ap@glowlab.example",
      startDate: "2026-12-01",
      endDate: "2027-01-15",
      totalFee: "15,500.00",
      depositAmount: "7,750.00",
      depositDueDate: "2026-12-01",
      balanceAmount: "7,750.00",
      balanceDueDate: "2027-01-15",
      creators: [
        influencer("@nadia.glow", "TikTok", "nadia@example.com", "2 TikTok videos", "3,000.00", "2026-12-12", "2026-12-16", "@glowlab.my", "#GlowLabSerum #ad #skincare", "2026-12-10", "2026-12-14"),
        influencer("@kenji.k", "Instagram", "kenji@example.com", "1 Reel + 3 Stories", "2,200.00", "2026-12-20", "2026-12-23", "@glowlab.my", "#GlowLabSerum #ad", "2026-12-18", "2026-12-21"),
        freelancer("Priya Nair", "Copywriting", "priya@example.com", "Launch email + 5 captions", "800.00", "2026-12-05", "2026-12-08"),
      ],
    },
  },
];
```

In `scripts/make-eval-files.ts`, add (import `CONTRACT_CASES, contractLines` from `../eval/contract-cases`) inside `main()`:
```ts
  for (const c of CONTRACT_CASES) writeFileSync(`eval/files/contract-${c.id}.pdf`, await textPdf(contractLines(c.expected)));
  console.log(`Wrote ${CONTRACT_CASES.length} contracts to eval/files`);
```

In `scripts/eval.ts`, add (imports: `readContract` from `../src/lib/ai/contract-reader`; `CONTRACT_CASES` from `../eval/contract-cases`; `type ContractReading` from `../src/lib/domain/contract`):
```ts
// Field-by-field: amounts compared as cents, hashtags as a set, text ignoring case and spaces.
function contractDiffs(expected: ContractReading, got: ContractReading): string[] {
  const norm = (s: string) => s.replace(/×/g, "x").replace(/\s+/g, " ").trim().toLowerCase();
  const same = (key: string, a: string, b: string) => {
    if (/fee|amount/i.test(key)) return parseUsdToCents(a) === parseUsdToCents(b);
    if (key === "hashtags") return norm(a).split(" ").sort().join(" ") === norm(b).split(" ").sort().join(" ");
    return norm(a) === norm(b);
  };
  const diffs: string[] = [];
  const { creators: ec, ...eTop } = expected;
  const { creators: gc, ...gTop } = got;
  for (const [k, v] of Object.entries(eTop)) if (!same(k, v, String(gTop[k as keyof typeof gTop] ?? ""))) diffs.push(`${k}: ${gTop[k as keyof typeof gTop]}`);
  if (gc.length !== ec.length) diffs.push(`creators: ${gc.length} found, ${ec.length} expected`);
  ec.forEach((e, i) => {
    const g = gc[i];
    if (!g) return;
    for (const [k, v] of Object.entries(e)) if (!same(k, v, String(g[k as keyof typeof g] ?? ""))) diffs.push(`creator ${i + 1} ${k}: ${g[k as keyof typeof g]}`);
  });
  return diffs;
}

async function evalContracts(): Promise<boolean> {
  const ai = aiFromEnv();
  let perfect = 0;
  for (const c of CONTRACT_CASES) {
    let diffs: string[];
    try {
      diffs = contractDiffs(c.expected, (await readContract(ai, pdfFile(`eval/files/contract-${c.id}.pdf`))).data);
    } catch (err) {
      diffs = [`error: ${err instanceof Error ? err.message : String(err)}`];
    }
    if (!diffs.length) perfect++;
    console.log(`${diffs.length ? "FAIL" : "PASS"}  ${c.id.padEnd(12)} ${diffs.join("; ")}`);
  }
  console.log(`\nContracts (${aiModel()}): every field correct on ${perfect}/${CONTRACT_CASES.length} (target ${CONTRACT_CASES.length}/${CONTRACT_CASES.length})\n`);
  return perfect === CONTRACT_CASES.length;
}
```
and change `main()` to:
```ts
async function main() {
  const invoicesOk = await evalInvoices();
  const contractsOk = await evalContracts();
  process.exit(invoicesOk && contractsOk ? 0 : 1);
}
```

- [ ] **Step 6: Run the eval**

Run: `npm run eval:files && npm run eval`
Expected: 10 invoice PASS lines and 3 contract PASS lines; both targets met. Tune `INSTRUCTIONS` (never the cases) if a field is wrong; fall back to Sonnet 5.5 as in Task 3.

- [ ] **Step 7: Commit**

```bash
npm test && npm run build
git add src/lib/domain src/lib/ai eval scripts
git status
git commit -m "feat: contract terms rules and AI contract reader, with contract eval cases"
```

---

### Task 5: Contract drafts and "create campaign" (R2, R3, R4) (60 min)

**Files:**
- Modify: `src/db/schema.ts` (`contracts` table)
- Modify: `src/test/fixtures.ts`, `scripts/seed.ts` (truncate `contracts`; seed mode `roster`), `package.json` (`db:seed:roster`)
- Modify: `src/lib/domain/upload.ts` (`CONTRACT_TYPES`, PDF-only message)
- Create: `src/lib/services/contracts.ts`
- Test: `src/lib/services/contracts.int.test.ts`, `src/lib/domain/rules.test.ts`

**Interfaces:**
- Consumes: `ContractForm`, `parseContractForm`, `RosterCreator` (Task 4), `writeAudit`, `isUuid`, `UploadedFile`.
- Produces:
  - table `contracts` (`id, fileName, fileType, file, extracted: ContractForm, model, status: "draft" | "confirmed", campaignId, uploadedBy, uploadedAt`)
  - `CONTRACT_TYPES = ["application/pdf"]`
  - `saveContractDraft(input: { file: UploadedFile; form: ContractForm; model: string; actor: string }): Promise<string>`
  - `getContractDraft(contractId: string): Promise<{ id; fileName; extracted: ContractForm; model; status; campaignId: string | null; uploadedBy } | null>`
  - `getContractFile(contractId: string): Promise<{ file: Buffer; fileType: string; fileName: string } | null>`
  - `listRoster(): Promise<RosterCreator[]>`
  - `confirmContract(input: { contractId: string; form: ContractForm; actor: string }): Promise<{ ok: true; campaignId: string } | { ok: false; errors: string[] }>`

- [ ] **Step 1: Schema**

In `src/db/schema.ts` add (import `type ContractForm` from `@/lib/domain/contract`):
```ts
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
```

In both `src/test/fixtures.ts` and `scripts/seed.ts`, change the truncate list to start with `contracts, webhook_events, …`.

Run: `npm run db:push` and `make test-db`.

- [ ] **Step 2: Contract upload type**

In `src/lib/domain/upload.ts`, add `export const CONTRACT_TYPES = ["application/pdf"] as const;` and replace the type-error line in `checkUpload` with:
```ts
  if (!allowed.includes(file.type)) {
    if (allowed.length === 1 && allowed[0] === "application/pdf") return "Upload the contract as a PDF";
    return allowed.includes("application/pdf") ? "Upload a PDF, PNG, JPEG or WebP file" : "Upload a PNG, JPEG or WebP image";
  }
```
Add to the `checkUpload` describe in `src/lib/domain/rules.test.ts` (import `CONTRACT_TYPES`):
```ts
  it("takes only a PDF for a contract", () => {
    expect(checkUpload(file("application/pdf"), CONTRACT_TYPES)).toBeNull();
    expect(checkUpload(file("image/png"), CONTRACT_TYPES)).toBe("Upload the contract as a PDF");
  });
```

- [ ] **Step 3: Write the failing integration tests**

Create `src/lib/services/contracts.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ContractForm } from "@/lib/domain/contract";
import { resetDb, seedAssignment } from "@/test/fixtures";
import { confirmContract, getContractDraft, saveContractDraft } from "./contracts";

const pdf = { name: "contract.pdf", type: "application/pdf", size: 3, bytes: Buffer.from([1, 2, 3]) };
const form = (): ContractForm => ({
  campaignName: "Teh Tarik · Raya Push",
  clientName: "Teh Tarik Co",
  clientEmail: "billing@tehtarik.example",
  startDate: "2026-11-02",
  endDate: "2026-11-30",
  totalFee: "8,000.00",
  depositAmount: "4,000.00",
  depositDueDate: "2026-11-02",
  balanceAmount: "4,000.00",
  balanceDueDate: "2026-11-30",
  creators: [
    { creatorId: "", name: "@sara.sips", type: "influencer", detail: "Instagram", paypalEmail: "sara@example.com", deliverable: "1 Reel", fee: "2,500.00", dueDate: "2026-11-10", payoutDate: "2026-11-13", brandTag: "@tehtarikco", hashtags: "#RayaWithTehTarik #ad", windowStart: "2026-11-09", windowEnd: "2026-11-11" },
    { creatorId: "", name: "Lina Ho", type: "freelancer", detail: "Photography", paypalEmail: "lina@example.com", deliverable: "10 product photos", fee: "1,500.00", dueDate: "2026-11-06", payoutDate: "2026-11-09", brandTag: "", hashtags: "", windowStart: "", windowEnd: "" },
  ],
});
const draft = (f = form()) => saveContractDraft({ file: pdf, form: f, model: "claude-haiku-5-5", actor: "Wanz" });
const campaignCount = async () => (await db.select().from(schema.campaigns)).length;

beforeEach(resetDb);

describe("confirmContract", () => {
  it("creates the campaign, its assignments and both draft invoices (R3)", async () => {
    const contractId = await draft();
    const r = await confirmContract({ contractId, form: form(), actor: "Wanz" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, r.campaignId));
    expect(campaign).toMatchObject({ name: "Teh Tarik · Raya Push", startDate: "2026-11-02", endDate: "2026-11-30", depositCleared: false });
    const assignments = await db.select().from(schema.assignments).where(eq(schema.assignments.campaignId, r.campaignId));
    expect(assignments.map((a) => [a.deliverable, a.feeCents, a.payoutDate]).sort()).toEqual([
      ["1 Reel", 250000, "2026-11-13"],
      ["10 product photos", 150000, "2026-11-09"],
    ]);
    expect(assignments.find((a) => a.feeCents === 250000)?.brief).toMatchObject({ hashtags: ["#RayaWithTehTarik", "#ad"] });
    const invoices = await db.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.campaignId, r.campaignId));
    expect(invoices.map((i) => [i.kind, i.amountCents, i.dueDate, i.status]).sort()).toEqual([
      ["balance", 400000, "2026-11-30", "draft"],
      ["deposit", 400000, "2026-11-02", "draft"],
    ]);
    expect(await getContractDraft(contractId)).toMatchObject({ status: "confirmed", campaignId: r.campaignId });
    expect((await db.select().from(schema.auditEvents)).map((a) => a.action)).toEqual(expect.arrayContaining(["contract.read", "campaign.created"]));
  });

  it("reuses a roster creator and an existing client instead of duplicating them (R4)", async () => {
    const { creator } = await seedAssignment(); // client "Client Co", creator "@tester"
    const f = form();
    f.clientName = "client co";
    f.creators[0] = { ...f.creators[0], creatorId: creator.id };
    await confirmContract({ contractId: await draft(f), form: f, actor: "Wanz" });
    expect(await db.select().from(schema.clients)).toHaveLength(1);
    expect(await db.select().from(schema.creators)).toHaveLength(2); // @tester (reused) + Lina Ho (new)
  });

  it("refuses invalid terms, creates nothing, and keeps the person's edits", async () => {
    const contractId = await draft();
    const f = { ...form(), depositAmount: "3,000.00" };
    expect(await confirmContract({ contractId, form: f, actor: "Wanz" })).toEqual({ ok: false, errors: ["Deposit and balance must add up to the total fee"] });
    expect(await campaignCount()).toBe(0);
    expect((await getContractDraft(contractId))?.extracted.depositAmount).toBe("3,000.00");
  });

  it("creates one campaign even when confirmed twice at the same moment", async () => {
    const contractId = await draft();
    const results = await Promise.all([confirmContract({ contractId, form: form(), actor: "Wanz" }), confirmContract({ contractId, form: form(), actor: "Hana Aziz" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, errors: ["This contract already created a campaign"] });
    expect(await campaignCount()).toBe(1);
  });
});
```

Run: `npm run test:int` → FAIL (`./contracts` not found).

- [ ] **Step 4: Implement**

Create `src/lib/services/contracts.ts`:
```ts
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
```

Run: `npm run test:int` → PASS. `npm test` → PASS.

- [ ] **Step 5: A roster-only seed for the demo's first step**

In `scripts/seed.ts`, the client, campaign and creators are inserted in that order. Change `main()` so the campaign comes after the creators and a `roster` mode stops before it:

1. Replace `const fresh = process.argv[2] === "fresh";` with:
```ts
  // "roster": client + creators only (demo step 1 uploads the contract). "fresh": deposit not sent. Default: mid-campaign.
  const mode = process.argv[2];
  const fresh = mode === "fresh";
```
2. Cut the whole `const [campaign] = await db.insert(schema.campaigns)…returning();` statement and paste it **after** the `const [aina, jason, mira, daniel] = …returning();` statement.
3. Between the two (after the creators, before the campaign), add:
```ts
  if (mode === "roster") {
    console.log("Seeded roster only: upload eval/files/contract-kopi-kita.pdf at /campaigns/new");
    process.exit(0);
  }
```

Add to `package.json`: `"db:seed:roster": "tsx --env-file=.env scripts/seed.ts roster"`.

Run: `npm run db:seed:roster` → the message; `npm run db:seed` still works.

- [ ] **Step 6: Commit**

```bash
npm test && npm run test:int && npm run build
git add src scripts package.json
git status
git commit -m "feat: contract drafts and confirming them into a campaign"
```

---

### Task 6: Upload and review a contract in the UI (R1, R2) (75 min)

**Files:**
- Create: `src/app/campaigns/new/page.tsx`, `src/app/campaigns/new/actions.ts`
- Create: `src/app/contracts/[id]/page.tsx`, `src/app/contracts/[id]/actions.ts`, `src/components/ContractReview.tsx`
- Create: `src/app/api/contracts/[id]/file/route.ts`
- Modify: `src/app/page.tsx` (link)

**Interfaces:**
- Consumes: `readContract` (Task 4), `formFromReading`, `ContractFormSchema`, `contractTotals`, `parseContractForm` (Task 4), `saveContractDraft`, `getContractDraft`, `getContractFile`, `listRoster`, `confirmContract` (Task 5), `SubmitButton` (Task 2), `FileInput`, `ActorSelect`, `Notice`, `backTo`, `actorFrom`, `fileFrom`, `text`.
- Produces: routes `/campaigns/new`, `/contracts/[id]`, `GET /api/contracts/[id]/file`; actions `uploadContract(form)`, `confirmContractAction(form)`.

- [ ] **Step 1: Upload page and action**

Create `src/app/campaigns/new/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { aiFromEnv } from "@/lib/ai/client";
import { readContract } from "@/lib/ai/contract-reader";
import { AiReadError } from "@/lib/ai/read-file";
import { formFromReading } from "@/lib/domain/contract";
import { checkUpload, CONTRACT_TYPES } from "@/lib/domain/upload";
import { actorFrom, backTo, fileFrom } from "@/lib/form";
import { listRoster, saveContractDraft } from "@/lib/services/contracts";

const HERE = "/campaigns/new";

// R1: read the signed contract into a draft, then send the person to review it.
export async function uploadContract(form: FormData) {
  const actor = actorFrom(form);
  const file = await fileFrom(form, "contract");
  if (!file) backTo(HERE, "Upload the signed contract PDF");
  const fileError = checkUpload(file, CONTRACT_TYPES);
  if (fileError) backTo(HERE, fileError);

  let reading: Awaited<ReturnType<typeof readContract>>;
  try {
    reading = await readContract(aiFromEnv(), file);
  } catch (err) {
    console.error("[ai] contract read failed", err);
    backTo(HERE, err instanceof AiReadError ? `${err.message}. Try again, or set AI_MODEL=claude-sonnet-5-5.` : "The AI couldn't be reached. Check ANTHROPIC_API_KEY and try again.");
  }
  const id = await saveContractDraft({ file, form: formFromReading(reading.data, await listRoster()), model: reading.model, actor });
  redirect(`/contracts/${id}`);
}
```

Create `src/app/campaigns/new/page.tsx`:
```tsx
import { Suspense } from "react";
import ActorSelect from "@/components/ActorSelect";
import FileInput from "@/components/FileInput";
import Notice from "@/components/Notice";
import SubmitButton from "@/components/SubmitButton";
import { buttonVariants } from "@/components/ui/button";
import { uploadContract } from "./actions";

type Props = { searchParams: Promise<{ notice?: string }> };

export default function NewCampaignPage({ searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-8 pt-6 pb-12">
      <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-zinc-500">
        <a href="/" className="hover:text-zinc-950">Campaigns</a>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-950">New from contract</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight">New campaign from a contract</h1>
      <p className="text-sm text-zinc-500">
        Upload the signed client contract. The AI reads the terms; you check every field before anything is created.
      </p>
      <Suspense fallback={null}>
        <UploadForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function UploadForm({ searchParams }: Props) {
  const { notice } = await searchParams;
  return (
    <>
      <Notice text={notice} />
      <form action={uploadContract} className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 p-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Signed contract (PDF)
          <FileInput name="contract" accept="application/pdf" className="text-sm font-normal" />
          <span className="text-xs font-normal text-zinc-500">Up to 4 MB. Reading takes about 10–20 seconds.</span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ActorSelect />
          <SubmitButton pending="Reading the contract…" className={buttonVariants()}>Read contract</SubmitButton>
        </div>
      </form>
    </>
  );
}
```

In `src/app/page.tsx`, under the `<h1>`, add:
```tsx
      <a href="/campaigns/new" className="self-start text-sm font-medium text-zinc-700 underline-offset-4 hover:underline">
        New campaign from a contract
      </a>
```

- [ ] **Step 2: The PDF route**

Create `src/app/api/contracts/[id]/file/route.ts`:
```ts
import { getContractFile } from "@/lib/services/contracts";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await getContractFile(id);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.file), {
    headers: {
      "Content-Type": f.fileType, // only application/pdf is accepted at upload
      "Content-Disposition": `inline; filename="${f.fileName.replace(/[^\w.-]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 3: The review form**

Create `src/components/ContractReview.tsx`:
```tsx
"use client";
import { useState, type ChangeEvent } from "react";
import { confirmContractAction } from "@/app/contracts/[id]/actions";
import ActorSelect from "@/components/ActorSelect";
import SubmitButton from "@/components/SubmitButton";
import { buttonVariants } from "@/components/ui/button";
import { contractTotals, parseContractForm, type ContractForm, type CreatorLine, type RosterCreator } from "@/lib/domain/contract";
import { formatUsd } from "@/lib/domain/money";

const inputCls = "min-h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm font-normal text-zinc-950 disabled:bg-zinc-50 disabled:text-zinc-500";
const labelCls = "flex flex-col gap-1 text-xs font-medium text-zinc-600";
const section = "flex flex-col gap-3 rounded-[10px] border border-zinc-200 p-4";
const BLANK: CreatorLine = {
  creatorId: "", name: "", type: "influencer", detail: "", paypalEmail: "", deliverable: "", fee: "",
  dueDate: "", payoutDate: "", brandTag: "", hashtags: "", windowStart: "", windowEnd: "",
};

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string }) {
  return (
    <label className={labelCls}>
      {props.label}
      <input
        className={inputCls}
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(e.target.value)}
      />
    </label>
  );
}

// R2: every extracted field is editable; totals and margin update as you type. The server validates again on confirm.
export default function ContractReview({ contractId, initial, roster }: { contractId: string; initial: ContractForm; roster: RosterCreator[] }) {
  const [form, setForm] = useState<ContractForm>(initial);
  const totals = contractTotals(form);
  const check = parseContractForm(form);
  const set = (key: Exclude<keyof ContractForm, "creators">) => (v: string) => setForm({ ...form, [key]: v });
  const setCreator = (i: number, patch: Partial<CreatorLine>) =>
    setForm({ ...form, creators: form.creators.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const pickRoster = (i: number, id: string) => {
    const r = roster.find((x) => x.id === id);
    setCreator(i, r ? { creatorId: r.id, name: r.name, type: r.type, detail: r.detail, paypalEmail: r.paypalEmail } : { creatorId: "" });
  };
  const usd = (cents: number | null) => (cents === null ? "—" : formatUsd(cents));

  return (
    <form action={confirmContractAction} className="flex flex-col gap-5">
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="form" value={JSON.stringify(form)} />

      <section aria-label="Totals" className="sticky top-2 z-10 flex flex-wrap gap-x-6 gap-y-1 rounded-[10px] border border-zinc-200 bg-white/95 px-4 py-3 text-sm backdrop-blur">
        <span>Client pays <strong className="tabular-nums">{usd(totals.totalCents)}</strong></span>
        <span>Creators cost <strong className="tabular-nums">{formatUsd(totals.creatorCents)}</strong></span>
        <span className={totals.marginCents !== null && totals.marginCents < 0 ? "text-red-700" : ""}>
          Margin <strong className="tabular-nums">{usd(totals.marginCents)}</strong>
        </span>
        <span className={totals.splitOk ? "text-green-700" : "text-amber-800"}>{totals.splitOk ? "Deposit + balance = total" : "Deposit + balance ≠ total"}</span>
      </section>

      <section className={section} aria-label="Campaign and client">
        <h2 className="text-[15px] font-semibold">Campaign and client</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name" value={form.campaignName} onChange={set("campaignName")} />
          <Field label="Client name" value={form.clientName} onChange={set("clientName")} />
          <Field label="Client billing email" type="email" value={form.clientEmail} onChange={set("clientEmail")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start" type="date" value={form.startDate} onChange={set("startDate")} />
            <Field label="End" type="date" value={form.endDate} onChange={set("endDate")} />
          </div>
        </div>
      </section>

      <section className={section} aria-label="Client billing">
        <h2 className="text-[15px] font-semibold">Client billing (USD)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Total fee" value={form.totalFee} onChange={set("totalFee")} placeholder="12,000.00" />
          <Field label="Deposit" value={form.depositAmount} onChange={set("depositAmount")} />
          <Field label="Deposit due" type="date" value={form.depositDueDate} onChange={set("depositDueDate")} />
          <span className="hidden sm:block" />
          <Field label="Balance" value={form.balanceAmount} onChange={set("balanceAmount")} />
          <Field label="Balance due" type="date" value={form.balanceDueDate} onChange={set("balanceDueDate")} />
        </div>
      </section>

      <section className={section} aria-label="Creators">
        <h2 className="text-[15px] font-semibold">Creators</h2>
        {form.creators.map((c, i) => {
          const fromRoster = Boolean(c.creatorId);
          return (
            <fieldset key={i} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3">
              <legend className="px-1 text-xs font-medium text-zinc-500">Creator {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  Roster
                  <select className={inputCls} value={c.creatorId} onChange={(e) => pickRoster(i, e.target.value)}>
                    <option value="">New creator</option>
                    {roster.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} · {r.paypalEmail}</option>
                    ))}
                  </select>
                </label>
                <Field label="Name or handle" value={c.name} disabled={fromRoster} onChange={(v) => setCreator(i, { name: v })} />
                <label className={labelCls}>
                  Type
                  <select className={inputCls} value={c.type} disabled={fromRoster} onChange={(e) => setCreator(i, { type: e.target.value as CreatorLine["type"] })}>
                    <option value="influencer">Influencer</option>
                    <option value="freelancer">Freelancer</option>
                  </select>
                </label>
                <Field label="Platform or service" value={c.detail} disabled={fromRoster} onChange={(v) => setCreator(i, { detail: v })} />
                <Field label="PayPal email" type="email" value={c.paypalEmail} disabled={fromRoster} onChange={(v) => setCreator(i, { paypalEmail: v })} />
                <Field label="Deliverable" value={c.deliverable} onChange={(v) => setCreator(i, { deliverable: v })} />
                <Field label="Fee (USD)" value={c.fee} onChange={(v) => setCreator(i, { fee: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Due" type="date" value={c.dueDate} onChange={(v) => setCreator(i, { dueDate: v })} />
                  <Field label="Payout date" type="date" value={c.payoutDate} onChange={(v) => setCreator(i, { payoutDate: v })} />
                </div>
                {c.type === "influencer" && (
                  <>
                    <Field label="Brand tag" value={c.brandTag} onChange={(v) => setCreator(i, { brandTag: v })} placeholder="@brand" />
                    <Field label="Hashtags" value={c.hashtags} onChange={(v) => setCreator(i, { hashtags: v })} placeholder="#Campaign #ad" />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Post from" type="date" value={c.windowStart} onChange={(v) => setCreator(i, { windowStart: v })} />
                      <Field label="Post until" type="date" value={c.windowEnd} onChange={(v) => setCreator(i, { windowEnd: v })} />
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                className="self-end text-xs text-zinc-600 underline-offset-4 hover:underline"
                onClick={() => setForm({ ...form, creators: form.creators.filter((_, j) => j !== i) })}
              >
                Remove creator
              </button>
            </fieldset>
          );
        })}
        <button type="button" className={`${buttonVariants({ variant: "outline", size: "sm" })} self-start`} onClick={() => setForm({ ...form, creators: [...form.creators, { ...BLANK }] })}>
          Add creator
        </button>
      </section>

      {!check.ok && (
        <ul role="status" className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {check.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <ActorSelect id="confirm-actor" />
        <SubmitButton pending="Creating…" className={buttonVariants()}>
          Create campaign
        </SubmitButton>
      </div>
      <p className="text-right text-xs text-zinc-500">Creates the campaign, its creators&apos; deliverables and payout dates, and the deposit and balance invoices as drafts.</p>
    </form>
  );
}
```

(The Create button stays enabled even with errors: the server re-checks and lists them, and the person's edits are saved either way.)

- [ ] **Step 4: Review page and confirm action**

Create `src/app/contracts/[id]/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { ContractFormSchema } from "@/lib/domain/contract";
import { actorFrom, backTo, text } from "@/lib/form";
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

  const r = await confirmContract({ contractId, form: shape.data, actor: actorFrom(form) });
  if (!r.ok) backTo(here, r.errors.join(". "));
  redirect(`/campaigns/${r.campaignId}/team?notice=${encodeURIComponent("Campaign created from the contract.")}`);
}
```

Create `src/app/contracts/[id]/page.tsx`:
```tsx
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import ContractReview from "@/components/ContractReview";
import Notice from "@/components/Notice";
import { getContractDraft, listRoster } from "@/lib/services/contracts";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

export default function ReviewContractPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading contract…</p>}>
        <Review {...props} />
      </Suspense>
    </main>
  );
}

async function Review({ params, searchParams }: Props) {
  const { id } = await params;
  const { notice } = await searchParams;
  const contract = await getContractDraft(id);
  if (!contract) notFound();
  if (contract.status === "confirmed" && contract.campaignId) redirect(`/campaigns/${contract.campaignId}/team`);
  const roster = await listRoster();

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-zinc-500">
        <a href="/" className="hover:text-zinc-950">Campaigns</a>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-950">Review contract</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight">Review contract</h1>
      <p className="text-sm text-zinc-500">
        Read by {contract.model} from {contract.fileName}.{" "}
        <a href={`/api/contracts/${contract.id}/file`} target="_blank" rel="noreferrer" className="text-zinc-700 underline underline-offset-4">
          Open the PDF
        </a>{" "}
        and check every field. Nothing is created until you click Create campaign.
      </p>
      <Notice text={notice} />
      <ContractReview contractId={contract.id} initial={contract.extracted} roster={roster} />
    </>
  );
}
```

- [ ] **Step 5: Check it in the browser**

`npm run db:seed:roster`, `npm run eval:files`, `npm run dev`.

Expected:
- Home → **New campaign from a contract** → upload `eval/files/contract-kopi-kita.pdf` → "Reading the contract…" → the review page.
- Fields match the PDF; the four creators are linked to the roster (their PayPal emails are the sandbox ones, fields greyed). Totals: client pays $12,000.00, creators $5,700.00, margin $6,300.00, "Deposit + balance = total".
- Change the deposit to `5,000.00` → amber error list and the split warning, live. **Create campaign** → notice with the same error, and the edit is still there after the reload.
- Fix it → **Create campaign** → Team view of the new campaign with every deliverable, both invoices, and the deposit panel. Calendar shows the same.
- Upload a PNG → "Upload the contract as a PDF".

- [ ] **Step 6: Commit**

```bash
npm test && npm run test:int && npm run build
git add src
git status
git commit -m "feat: upload a contract, review the AI's reading, create the campaign"
```

---

### Task 7: Event colours, overdue, side panel and live refresh (R13, R14, R18) (75 min)

**Files:**
- Modify: `src/lib/events.ts`, `src/lib/load-timeline.ts`
- Create: `src/components/EventPanel.tsx`, `src/components/useAutoRefresh.ts`
- Modify: `src/components/TeamSchedulerInner.tsx`, `src/components/CampaignCalendarInner.tsx`
- Test: `src/lib/events.test.ts`

**Interfaces:**
- Consumes: `verificationLabel` (Phase 2/Task 2), `agencyToday`, `formatDay`.
- Produces:
  - `TimelineInput` gains `campaignId: string; today: string`; assignments gain `deliverable: string; verified: string`; invoices gain `paypalInvoiceId: string | null`; payouts gain `statusReason: string | null`
  - `TimelineEvent` gains `refId: string` (assignment, invoice or payout id) and `panel: { title: string; lines: string[]; links: Array<{ href: string; label: string }> }`
  - `<EventPanel event onClose>`; `useAutoRefresh(seconds: number, paused: RefObject<boolean>)`

- [ ] **Step 1: Update the test input and write the failing tests**

In `src/lib/events.test.ts`, replace the `input` object with:
```ts
const input: TimelineInput = {
  campaignId: "cp",
  today: "2026-10-20",
  client: { id: "cl", name: "Kopi Kita Sdn Bhd" },
  assignments: [
    { id: "as1", creatorId: "cr1", creatorName: "@jasonlifts", creatorType: "influencer", deliverable: "1 TikTok video", dueDate: "2026-10-24", status: "verified", feeCents: 120000, verified: "Post checklist · Wanz" },
    { id: "as2", creatorId: "cr2", creatorName: "Daniel Lim", creatorType: "freelancer", deliverable: "2 × 30s product video edits", dueDate: "2026-10-27", status: "held", feeCents: 100000, verified: "Not verified" },
  ],
  invoices: [{ id: "inv1", kind: "deposit", amountCents: 600000, dueDate: "2026-10-16", status: "paid", paypalInvoiceId: "INV2-1" }],
  payouts: [{ id: "po1", assignmentId: "as1", amountCents: 120000, scheduledFor: "2026-10-29", status: "awaiting_approval", statusReason: null }],
};
```
and add:
```ts
describe("overdue and side panel", () => {
  const late: TimelineInput = {
    ...input,
    today: "2026-10-26",
    assignments: [{ ...input.assignments[0], status: "scheduled" }],
    invoices: [{ ...input.invoices[0], status: "sent", dueDate: "2026-10-25" }],
  };
  const byId = Object.fromEntries(toTimeline(late).events.map((e) => [e.id, e]));

  it("turns a past-due post or unpaid invoice red (R13)", () => {
    expect(byId["assignment-as1"]).toMatchObject({ eventColor: "red", shortName: "Overdue" });
    expect(byId["invoice-inv1"]).toMatchObject({ eventColor: "red", shortName: "Overdue" });
  });

  it("gives every event its record id and the details and links for the side panel (R18)", () => {
    const { events } = toTimeline(input);
    const e = Object.fromEntries(events.map((x) => [x.id, x]));
    expect(e["assignment-as1"].refId).toBe("as1");
    expect(e["assignment-as1"].panel).toEqual({
      title: "@jasonlifts · 1 TikTok video",
      lines: ["Post due Oct 24", "Fee $1,200.00", "Status: verified", "Verification: Post checklist · Wanz"],
      links: [{ href: "/campaigns/cp/assignments/as1", label: "Verify post" }],
    });
    expect(e["payout-po1"].panel.links).toEqual([
      { href: "/approvals", label: "Approve in the queue" },
      { href: "/approvals/po1", label: "Edit or reject" },
      { href: "/campaigns/cp/audit", label: "Audit log" },
    ]);
    expect(e["invoice-inv1"].panel.lines).toContain("PayPal invoice INV2-1");
  });
});
```

Run: `npx vitest run src/lib/events.test.ts` → FAIL (type errors on the new fields / missing `panel`).

- [ ] **Step 2: Implement in `events.ts`**

In `src/lib/events.ts`:

1. Add `import { formatDay } from "./domain/format";` and `import { formatUsd } from "./domain/money";`.
2. Extend the types:
```ts
export interface TimelineInput {
  campaignId: string;
  today: string; // agency date, for "overdue"
  client: { id: string; name: string };
  assignments: Array<{
    id: string;
    creatorId: string;
    creatorName: string;
    creatorType: "influencer" | "freelancer";
    deliverable: string;
    dueDate: string;
    status: "scheduled" | "submitted" | "verified" | "held" | "paid";
    feeCents: number;
    verified: string; // e.g. "Post checklist · Wanz" or "Not verified"
  }>;
  invoices: Array<{ id: string; kind: "deposit" | "balance"; amountCents: number; dueDate: string; status: "draft" | "sent" | "paid"; paypalInvoiceId: string | null }>;
  payouts: Array<{
    id: string;
    assignmentId: string;
    amountCents: number;
    scheduledFor: string;
    status: "awaiting_approval" | "scheduled" | "payout_sent" | "paid" | "payout_failed" | "held";
    statusReason: string | null;
  }>;
}

export interface EventPanelContent {
  title: string;
  lines: string[];
  links: Array<{ href: string; label: string }>;
}
```
and add to `TimelineEvent`:
```ts
  refId: string; // the assignment, invoice or payout id
  panel: EventPanelContent; // R18: what the side panel shows
```
3. Replace the assignment loop body's `events.push({...})` with:
```ts
    const overdue = (a.status === "scheduled" || a.status === "submitted") && a.dueDate < input.today;
    const what = kind === "post" ? "Post" : "Deliverable";
    events.push({
      id: `assignment-${a.id}`,
      refId: a.id,
      resourceId: a.creatorId,
      name: `${what} · ${overdue ? "overdue" : a.status}`,
      shortName: overdue ? "Overdue" : capitalize(a.status),
      ...day(a.dueDate),
      eventColor: overdue || a.status === "held" ? "red" : kind === "post" ? "violet" : "orange",
      kind,
      draggable: a.status !== "paid",
      resizable: false,
      panel: {
        title: `${a.creatorName} · ${a.deliverable}`,
        lines: [`${what} due ${formatDay(a.dueDate)}`, `Fee ${formatUsd(a.feeCents)}`, `Status: ${overdue ? "overdue" : a.status}`, `Verification: ${a.verified}`],
        links: [{ href: `/campaigns/${input.campaignId}/assignments/${a.id}`, label: kind === "post" ? "Verify post" : "Check invoice" }],
      },
    });
```
4. Replace the invoice loop's `events.push({...})` with:
```ts
    const overdue = inv.status === "sent" && inv.dueDate < input.today;
    const label = inv.kind === "deposit" ? "Deposit" : "Balance";
    events.push({
      id: `invoice-${inv.id}`,
      refId: inv.id,
      resourceId: "client",
      name: `${label} ${usd(inv.amountCents)} · ${overdue ? "overdue" : inv.status}`,
      shortName: overdue ? "Overdue" : `${label} ${usd(inv.amountCents)}`,
      ...day(inv.dueDate),
      eventColor: overdue ? "red" : "blue",
      kind: "invoice",
      draggable: false,
      resizable: false,
      panel: {
        title: `${label} invoice · ${input.client.name}`,
        lines: [
          `Amount ${formatUsd(inv.amountCents)}`,
          `Due ${formatDay(inv.dueDate)}`,
          `Status: ${overdue ? "overdue" : inv.status}`,
          inv.paypalInvoiceId ? `PayPal invoice ${inv.paypalInvoiceId}` : "Not created in PayPal yet",
        ],
        links: [{ href: `/campaigns/${input.campaignId}/team`, label: "Invoices on the Team view" }],
      },
    });
```
5. Replace the payout loop with:
```ts
  const creatorOf = new Map(input.assignments.map((a) => [a.id, a]));
  for (const p of input.payouts) {
    const [label, short, color] = PAYOUT_LABEL[p.status];
    const a = creatorOf.get(p.assignmentId);
    const open = p.status === "awaiting_approval" || p.status === "scheduled";
    events.push({
      id: `payout-${p.id}`,
      refId: p.id,
      resourceId: a?.creatorId ?? "client",
      name: `${label} ${usd(p.amountCents)}`,
      shortName: `${short} ${usd(p.amountCents)}`,
      ...day(p.scheduledFor),
      eventColor: color,
      kind: "payout",
      draggable: false,
      resizable: false,
      panel: {
        title: `Payout · ${a?.creatorName ?? "creator"}`,
        lines: [
          `Amount ${formatUsd(p.amountCents)}${a ? ` (contract fee ${formatUsd(a.feeCents)})` : ""}`,
          `Payout date ${formatDay(p.scheduledFor)}`,
          `Status: ${label}`,
          ...(p.statusReason ? [`Reason: ${p.statusReason}`] : []),
        ],
        links: [
          ...(open ? [{ href: "/approvals", label: p.status === "awaiting_approval" ? "Approve in the queue" : "Send now in the queue" }] : []),
          ...(open ? [{ href: `/approvals/${p.id}`, label: "Edit or reject" }] : []),
          { href: `/campaigns/${input.campaignId}/audit`, label: "Audit log" },
        ],
      },
    });
  }
```

Run: `npx vitest run src/lib/events.test.ts` → PASS.

- [ ] **Step 3: Feed the new fields**

In `src/lib/load-timeline.ts` (imports: `agencyToday` from `./domain/today`, `verificationLabel` from `./services/queries`), after the `payouts` query add:
```ts
  const verified = await Promise.all(rows.map((r) => verificationLabel(r.a.id)));
```
and change the `toTimeline({...})` call to:
```ts
    ...toTimeline({
      campaignId,
      today: agencyToday(),
      client: { id: client.id, name: client.name },
      assignments: rows.map(({ a, c }, i) => ({
        id: a.id,
        creatorId: c.id,
        creatorName: c.name,
        creatorType: c.type,
        deliverable: a.deliverable,
        dueDate: a.dueDate,
        status: a.status,
        feeCents: a.feeCents,
        verified: verified[i],
      })),
      invoices,
      payouts,
    }),
```

- [ ] **Step 4: Side panel and refresh hook**

Create `src/components/useAutoRefresh.ts`:
```ts
"use client";
import { useRouter } from "next/navigation";
import { useEffect, type RefObject } from "react";

// R6/R14: re-fetch the server data every few seconds, so changes from the other view, a teammate or
// PayPal's webhook show up without a reload. Skipped while paused (a drag in progress) or the tab is hidden.
export function useAutoRefresh(seconds: number, paused: RefObject<boolean>) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (!paused.current && document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds, paused]);
}
```

Create `src/components/EventPanel.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { TimelineEvent } from "@/lib/events";

// R18: details of the clicked event, with links to where its actions live. No dialog: a panel beside the view.
export default function EventPanel({ event, onClose }: { event: TimelineEvent | undefined; onClose: () => void }) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event) return null;
  return (
    <aside
      aria-label="Event details"
      className="fixed inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-y-auto border-t border-zinc-200 bg-white p-5 shadow-lg sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[360px] sm:border-t-0 sm:border-l"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">{event.panel.title}</h2>
        <button type="button" onClick={onClose} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Close
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm text-zinc-700">
        {event.panel.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2">
        {event.panel.links.map((l) => (
          <a key={l.href + l.label} href={l.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {l.label}
          </a>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Wire them into both views**

In `src/components/TeamSchedulerInner.tsx`:
1. Add imports: `import { useCallback, useRef, useState } from "react";`, `import EventPanel from "./EventPanel";`, `import { useAutoRefresh } from "./useAutoRefresh";`.
2. At the top of the component body:
```tsx
  const dragging = useRef(false); // Task 8 sets it during a drag
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const selected = props.events.find((e) => e.id === selectedId); // looked up each render, so the panel stays fresh
  useAutoRefresh(3, dragging);
```
3. Add the prop `onEventClick={({ eventRecord }) => setSelectedId(String(eventRecord.id))}` to `<BryntumScheduler>`.
4. Wrap the return in a fragment and render `<EventPanel event={selected} onClose={close} />` after the scheduler's `<div>`.

Do the same in `src/components/CampaignCalendarInner.tsx` (the Calendar's `onEventClick` also receives `{ eventRecord }`). Keep `modes={{ year: false, agenda: false }}`: month, week and day layouts stay available (R14).

- [ ] **Step 6: Check it in the browser**

`npm run db:seed`, `npm run dev`, open the campaign's Team view in one window and its Calendar in another.

Expected:
- Colours follow the legend. Use `docker compose exec db psql -U ontrack ontrack -c "update assignments set due_date = '2026-10-01' where deliverable = '1 Reel'"` → within 3 s @mira.travels's chip turns red "Overdue" in both windows without a reload.
- Click any chip → the panel slides in on the right (bottom on a phone-width window) with the details and links; **Esc** or **Close** hides it; the links work.
- Approve @jasonlifts in a third tab → the yellow "Approve $1,200" chip turns lime "Scheduled" in both views within 3 s.
- Calendar: switch to **Week** → the same events.

- [ ] **Step 7: Commit**

```bash
npm test && npm run build
git add src
git status
git commit -m "feat: overdue colours, event side panel and live refresh in both views"
```

---

### Task 8: Drag a deliverable to reschedule it (R19, part 1) (75 min)

**Files:**
- Create: `src/lib/domain/reschedule.ts`, `src/lib/services/reschedule.ts`
- Create: `src/app/campaigns/[id]/view-actions.ts`, `src/components/view-actor.ts`
- Modify: `src/components/TeamSchedulerInner.tsx`, `src/components/CampaignCalendarInner.tsx`
- Modify: `src/app/campaigns/[id]/team/page.tsx`, `src/app/campaigns/[id]/calendar/page.tsx` (actor picker)
- Test: `src/lib/domain/reschedule.test.ts`, `src/lib/services/reschedule.int.test.ts`

**Interfaces:**
- Consumes: `addDays` (`src/lib/events.ts`), `isDay` (Task 4), `lockAssignment`, `writeAudit`, `ActionResult`, `isStaff`, `STAFF`, `agencyToday`.
- Produces:
  - `daysBetween(from: string, to: string): number`, `planReschedule(current: { dueDate: string; payoutDate: string; brief: PostBrief | null }, newDueDate: string, today: string): { ok: true; changed: boolean; dueDate: string; payoutDate: string; brief: PostBrief | null } | { ok: false; error: string }`
  - `rescheduleAssignment(input: { assignmentId: string; newDueDate: string; actor: string; today: string }): Promise<ActionResult>`
  - Server Action `moveAssignment(eventId: string, newDueDate: string, actor: string): Promise<ActionResult>`
  - `readActor(): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/reschedule.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { daysBetween, planReschedule } from "./reschedule";

const current = {
  dueDate: "2026-10-27",
  payoutDate: "2026-10-30",
  brief: { brandTag: "@kopikita", hashtags: ["#ad"], windowStart: "2026-10-26", windowEnd: "2026-10-28" },
};

describe("daysBetween", () => {
  it("counts calendar days across a month end", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-11-02", "2026-10-30")).toBe(-3);
  });
});

describe("planReschedule", () => {
  it("moves the due date, the payout date and the posting window by the same number of days", () => {
    expect(planReschedule(current, "2026-10-30", "2026-10-20")).toEqual({
      ok: true,
      changed: true,
      dueDate: "2026-10-30",
      payoutDate: "2026-11-02",
      brief: { brandTag: "@kopikita", hashtags: ["#ad"], windowStart: "2026-10-29", windowEnd: "2026-10-31" },
    });
  });
  it("keeps a freelancer's missing brief missing", () => {
    expect(planReschedule({ ...current, brief: null }, "2026-10-28", "2026-10-20")).toMatchObject({ ok: true, brief: null, payoutDate: "2026-10-31" });
  });
  it("does nothing when dropped back on the same day", () => {
    expect(planReschedule(current, "2026-10-27", "2026-10-20")).toEqual({ ok: true, changed: false, ...current });
  });
  it("refuses a past day or a non-date", () => {
    expect(planReschedule(current, "2026-10-19", "2026-10-20")).toEqual({ ok: false, error: "Can't move a deliverable into the past" });
    expect(planReschedule(current, "2026-13-01", "2026-10-20")).toEqual({ ok: false, error: "That isn't a valid date" });
  });
});
```

Create `src/lib/services/reschedule.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, seedAssignment, seedPayout } from "@/test/fixtures";
import { rescheduleAssignment } from "./reschedule";

beforeEach(resetDb);
const today = "2026-10-20";
const assignmentRow = async (id: string) => (await db.select().from(schema.assignments).where(eq(schema.assignments.id, id)))[0];
const payoutRow = async (id: string) => (await db.select().from(schema.payouts).where(eq(schema.payouts.id, id)))[0];

describe("rescheduleAssignment", () => {
  it("moves the deliverable and its payout date together, and logs it", async () => {
    const { assignment } = await seedAssignment(); // due 2026-10-24, payout 2026-10-29
    expect(await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-27", actor: "Wanz", today })).toEqual({ ok: true });
    expect(await assignmentRow(assignment.id)).toMatchObject({ dueDate: "2026-10-27", payoutDate: "2026-11-01" });
    const [audit] = await db.select().from(schema.auditEvents);
    expect(audit).toMatchObject({ action: "assignment.rescheduled", actor: "Wanz" });
  });
  it("moves a queued payout's date, and sends an approved payout back for approval (R26)", async () => {
    const { assignment, payout } = await seedPayout({ status: "scheduled", approvedBy: "Wanz" });
    await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-26", actor: "Hana Aziz", today });
    expect(await payoutRow(payout.id)).toMatchObject({ scheduledFor: "2026-10-31", status: "awaiting_approval", approvedBy: null });
  });
  it("refuses once the payout was sent", async () => {
    const { assignment } = await seedPayout({ status: "payout_sent", approvedBy: "Wanz" });
    expect(await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-26", actor: "Wanz", today })).toEqual({ ok: false, reason: "The payout was already sent" });
  });
  it("refuses a past day and writes nothing for a same-day drop", async () => {
    const { assignment } = await seedAssignment();
    expect(await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-01", actor: "Wanz", today })).toEqual({ ok: false, reason: "Can't move a deliverable into the past" });
    expect(await rescheduleAssignment({ assignmentId: assignment.id, newDueDate: "2026-10-24", actor: "Wanz", today })).toEqual({ ok: true });
    expect(await db.select().from(schema.auditEvents)).toHaveLength(0);
  });
});
```

Run: `npx vitest run src/lib/domain/reschedule.test.ts` and `npm run test:int` → FAIL (modules not found).

- [ ] **Step 2: Implement the rules and the service**

Create `src/lib/domain/reschedule.ts`:
```ts
import { addDays } from "@/lib/events";
import { isDay } from "./format";
import type { PostBrief } from "./types";

// Whole calendar days from one YYYY-MM-DD to another (UTC, so no timezone drift).
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// R19: a dragged deliverable takes its payout date and posting window with it, by the same number of days.
export function planReschedule(
  current: { dueDate: string; payoutDate: string; brief: PostBrief | null },
  newDueDate: string,
  today: string,
): { ok: true; changed: boolean; dueDate: string; payoutDate: string; brief: PostBrief | null } | { ok: false; error: string } {
  if (!isDay(newDueDate)) return { ok: false, error: "That isn't a valid date" };
  if (newDueDate === current.dueDate) return { ok: true, changed: false, ...current };
  if (newDueDate < today) return { ok: false, error: "Can't move a deliverable into the past" };
  const shift = daysBetween(current.dueDate, newDueDate);
  const move = (d: string) => addDays(d, shift);
  return {
    ok: true,
    changed: true,
    dueDate: newDueDate,
    payoutDate: move(current.payoutDate),
    brief: current.brief && { ...current.brief, windowStart: move(current.brief.windowStart), windowEnd: move(current.brief.windowEnd) },
  };
}
```

Create `src/lib/services/reschedule.ts`:
```ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { planReschedule } from "@/lib/domain/reschedule";
import { isUuid } from "@/lib/uuid";
import type { ActionResult } from "./payouts";
import { lockAssignment } from "./verification";

export async function rescheduleAssignment(input: { assignmentId: string; newDueDate: string; actor: string; today: string }): Promise<ActionResult> {
  if (!isUuid(input.assignmentId)) return { ok: false, reason: "Assignment not found" };
  return db.transaction(async (tx): Promise<ActionResult> => {
    const row = await lockAssignment(tx, input.assignmentId);
    if (!row) return { ok: false, reason: "Assignment not found" };
    const { assignment, creator, campaign } = row;
    if (assignment.status === "paid") return { ok: false, reason: "This work is already paid" };
    const [payout] = await tx.select().from(schema.payouts).where(eq(schema.payouts.assignmentId, assignment.id)).for("update");
    if (payout && (payout.status === "payout_sent" || payout.status === "paid")) return { ok: false, reason: "The payout was already sent" };

    const plan = planReschedule({ dueDate: assignment.dueDate, payoutDate: assignment.payoutDate, brief: assignment.brief }, input.newDueDate, input.today);
    if (!plan.ok) return { ok: false, reason: plan.error };
    if (!plan.changed) return { ok: true };

    await tx.update(schema.assignments).set({ dueDate: plan.dueDate, payoutDate: plan.payoutDate, brief: plan.brief }).where(eq(schema.assignments.id, assignment.id));
    const approvalReset = payout?.status === "scheduled";
    if (payout && (payout.status === "awaiting_approval" || payout.status === "scheduled")) {
      await tx
        .update(schema.payouts)
        .set({ scheduledFor: plan.payoutDate, ...(approvalReset ? { status: "awaiting_approval" as const, approvedBy: null, approvedAt: null } : {}) })
        .where(eq(schema.payouts.id, payout.id));
    }
    await writeAudit(tx, {
      campaignId: campaign.id,
      actor: input.actor,
      action: "assignment.rescheduled",
      detail: {
        assignmentId: assignment.id,
        creator: creator.name,
        before: { dueDate: assignment.dueDate, payoutDate: assignment.payoutDate },
        after: { dueDate: plan.dueDate, payoutDate: plan.payoutDate },
        approvalReset,
      },
    });
    return { ok: true };
  });
}
```

Run both test commands → PASS.

- [ ] **Step 3: The Server Action and the actor helper**

Create `src/app/campaigns/[id]/view-actions.ts`:
```ts
"use server";
import { agencyToday } from "@/lib/domain/today";
import type { ActionResult } from "@/lib/services/payouts";
import { rescheduleAssignment } from "@/lib/services/reschedule";
import { isStaff } from "@/lib/staff";

// Called from a Bryntum drop (not a form), so it returns a result instead of redirecting.
export async function moveAssignment(eventId: string, newDueDate: string, actor: string): Promise<ActionResult> {
  if (!isStaff(actor)) return { ok: false, reason: "Unknown staff member" };
  if (!eventId.startsWith("assignment-")) return { ok: false, reason: "Only posts and deliverables can be moved" };
  return rescheduleAssignment({ assignmentId: eventId.slice("assignment-".length), newDueDate, actor, today: agencyToday() });
}
```

Create `src/components/view-actor.ts`:
```ts
import { STAFF } from "@/lib/staff";

// No login yet: the views have an "Acting as" picker with this id; a drag is recorded under that name.
export function readActor(): string {
  const el = document.getElementById("view-actor");
  return el instanceof HTMLSelectElement ? el.value : STAFF[0];
}
```

In both `src/app/campaigns/[id]/team/page.tsx` and `.../calendar/page.tsx`, import `ActorSelect` and render it right before the view component:
```tsx
      <div className="flex justify-end">
        <ActorSelect id="view-actor" />
      </div>
```

- [ ] **Step 4: Turn on dragging in both views**

In `src/components/TeamSchedulerInner.tsx` (imports: `useRouter` from `next/navigation`; `moveAssignment` from `@/app/campaigns/[id]/view-actions`; `readActor` from `./view-actor`):

1. In the component body add:
```tsx
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // The server's dates always win: after any drop, refresh; a refused move snaps back.
  async function save(eventId: string, start: Date) {
    const r = await moveAssignment(eventId, DateHelper.format(start, "YYYY-MM-DD"), readActor());
    setError(r.ok ? null : r.reason);
    router.refresh();
  }
```
2. Replace the `readOnly` prop (and its comment) with:
```tsx
        // Only posts and deliverables move (each event's `draggable`), only along their own row. No editing, creating or resizing.
        eventDragFeature={{ constrainDragToResource: true }}
        eventEditFeature={false}
        eventDragCreateFeature={false}
        eventResizeFeature={false}
        eventMenuFeature={false}
        scheduleMenuFeature={false}
        cellEditFeature={false}
        onBeforeEventDrag={() => {
          dragging.current = true;
        }}
        onAfterEventDrop={() => {
          dragging.current = false;
        }}
        onEventDrop={({ eventRecords }) => {
          void save(String(eventRecords[0].id), eventRecords[0].startDate as Date);
        }}
```
3. Above the scheduler's `<div>`, render:
```tsx
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
```

In `src/components/CampaignCalendarInner.tsx` do the same (`DateHelper` from `@bryntum/calendar`), replacing `readOnly` with:
```tsx
        eventEditFeature={false}
        eventMenuFeature={false}
        scheduleMenuFeature={false}
        dragFeature={{ creatable: false }}
        onBeforeDragMove={() => {
          dragging.current = true;
        }}
        onBeforeDragMoveEnd={({ eventRecord, newStartDate }) => {
          void save(String(eventRecord.id), newStartDate);
        }}
        onDragMoveEnd={() => {
          dragging.current = false;
        }}
```

- [ ] **Step 5: Check it in the browser**

`npm run db:seed`, `npm run dev`; Team view in one window, Calendar in another.

Expected:
- Drag @mira.travels's post from Wed Oct 28 to Fri Oct 30 in the **Calendar** → within 3 s the Team view shows it on Oct 30, and her payout date moved by 2 days (Assignments table / audit log `assignment.rescheduled` with before and after).
- Drag @jasonlifts's post in the **Team** view → same in the Calendar. Approve his payout first: after the drag it is back to "Awaiting approval" (R26).
- Payout and invoice chips can't be dragged; a post can't be dragged to another creator's row.
- Drag a post onto yesterday → red "Can't move a deliverable into the past" and it snaps back.
- Start a drag and hold it for 5 s: the 3 s refresh does not cancel it.

- [ ] **Step 6: Commit**

```bash
npm test && npm run test:int && npm run build
git add src
git status
git commit -m "feat: drag a post or deliverable to reschedule it with its payout date"
```

---

### Task 9: Propose a new balance due date and update the PayPal invoice (R19, part 2) (60 min)

When a deliverable now lands after the campaign end, the views show a proposal: "Move the balance invoice from Nov 20 to Nov 23?". Approving it updates the campaign end, the balance invoice's due date and, if it exists in PayPal, the PayPal invoice. The proposal is plain code; the Claude-written version is the agent (R22, Phase 4).

**Files:**
- Create: `src/lib/domain/balance.ts`, `src/lib/services/balance.ts`, `src/components/BalanceProposal.tsx`
- Modify: `src/lib/paypal/invoicing.ts` (`updateInvoiceDueDate`)
- Modify: `src/app/campaigns/[id]/actions.ts` (`approveBalanceMoveAction`)
- Modify: `src/app/campaigns/[id]/team/page.tsx`, `.../calendar/page.tsx` (render the proposal)
- Test: `src/lib/domain/balance.test.ts`, `src/lib/paypal/invoicing.test.ts`, `src/lib/services/balance.int.test.ts`

**Interfaces:**
- Consumes: `daysBetween` (Task 8), `addDays`, `formatDay`, `PayPalClient`, `PayPalError`, `writeAudit`, `ActionResult`.
- Produces:
  - `balanceProposal(input: { endDate: string; latest: { dueDate: string; creatorName: string } | null; balance: { dueDate: string; status: "draft" | "sent" | "paid" } | null }): { newEndDate: string; newDueDate: string; reason: string } | null`
  - `updateInvoiceDueDate(pp: PayPalClient, invoiceId: string, dueDate: string): Promise<void>`
  - `getBalanceProposal(campaignId: string)`, `approveBalanceMove(pp: PayPalClient, input: { campaignId: string; newDueDate: string; actor: string }): Promise<ActionResult>`
  - `<BalanceProposal campaignId view>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/balance.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { balanceProposal } from "./balance";

const base = { endDate: "2026-11-20", balance: { dueDate: "2026-11-20", status: "draft" as const } };

describe("balanceProposal", () => {
  it("proposes moving the balance when a deliverable now lands after the campaign end", () => {
    expect(balanceProposal({ ...base, latest: { dueDate: "2026-11-23", creatorName: "@mira.travels" } })).toEqual({
      newEndDate: "2026-11-23",
      newDueDate: "2026-11-23",
      reason: "@mira.travels now delivers Nov 23, after the campaign end (Nov 20).",
    });
  });
  it("keeps the gap between the campaign end and the balance due date", () => {
    expect(balanceProposal({ endDate: "2026-11-20", balance: { dueDate: "2026-11-27", status: "sent" }, latest: { dueDate: "2026-11-23", creatorName: "X" } })).toMatchObject({ newDueDate: "2026-11-30" });
  });
  it("proposes nothing when everything fits, the balance is paid, or there is no balance invoice", () => {
    expect(balanceProposal({ ...base, latest: { dueDate: "2026-11-20", creatorName: "X" } })).toBeNull();
    expect(balanceProposal({ ...base, balance: { dueDate: "2026-11-20", status: "paid" }, latest: { dueDate: "2026-11-23", creatorName: "X" } })).toBeNull();
    expect(balanceProposal({ ...base, balance: null, latest: { dueDate: "2026-11-23", creatorName: "X" } })).toBeNull();
    expect(balanceProposal({ ...base, latest: null })).toBeNull();
  });
});
```
Add to `src/lib/paypal/invoicing.test.ts` (import `updateInvoiceDueDate`):
```ts
describe("updateInvoiceDueDate", () => {
  it("reads the whole invoice and puts it back with only the due date changed (PayPal has no partial update)", async () => {
    const invoice = {
      id: "INV2-9",
      status: "SENT",
      detail: { invoice_number: "OT-1-BAL", currency_code: "USD", payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: "2026-11-20" } },
      items: [{ name: "Balance" }],
      links: [{ href: "x", rel: "self" }],
    };
    const request = vi.fn().mockResolvedValueOnce(invoice).mockResolvedValueOnce({});
    await updateInvoiceDueDate({ request } as unknown as PayPalClient, "INV2-9", "2026-11-23");
    expect(request.mock.calls[0]).toEqual(["GET", "/v2/invoicing/invoices/INV2-9"]);
    const [method, path, body] = request.mock.calls[1];
    expect(method).toBe("PUT");
    expect(path).toBe("/v2/invoicing/invoices/INV2-9?send_to_recipient=false&send_to_invoicer=false");
    expect(body.detail).toEqual({ ...invoice.detail, payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: "2026-11-23" } });
    expect(body.items).toEqual(invoice.items);
    expect(body.links).toBeUndefined();
  });
});
```

Create `src/lib/services/balance.int.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PayPalError, type PayPalClient } from "@/lib/paypal/client";
import { resetDb, seedAssignment } from "@/test/fixtures";
import { approveBalanceMove, getBalanceProposal } from "./balance";

beforeEach(resetDb);

// Campaign ends 2026-11-20; the assignment is pushed to 2026-11-23.
async function lateCampaign(paypalInvoiceId: string | null = "INV2-B") {
  const base = await seedAssignment();
  await db.update(schema.assignments).set({ dueDate: "2026-11-23" }).where(eq(schema.assignments.id, base.assignment.id));
  await db.insert(schema.clientInvoices).values({ campaignId: base.campaign.id, kind: "balance", amountCents: 600000, dueDate: "2026-11-20", status: "sent", paypalInvoiceId });
  return base;
}
const fakePayPal = (fail = false) => {
  const request = vi.fn(async (method: string) => {
    if (fail && method === "PUT") throw new PayPalError(422, "{}");
    return method === "GET" ? { id: "INV2-B", detail: { payment_term: { due_date: "2026-11-20" } } } : {};
  });
  return { pp: { request } as unknown as PayPalClient, request };
};

describe("approveBalanceMove", () => {
  it("moves the campaign end and the balance due date, in PayPal first", async () => {
    const { campaign } = await lateCampaign();
    expect((await getBalanceProposal(campaign.id))?.proposal?.newDueDate).toBe("2026-11-23");
    const { pp, request } = fakePayPal();
    expect(await approveBalanceMove(pp, { campaignId: campaign.id, newDueDate: "2026-11-23", actor: "Hana Aziz" })).toEqual({ ok: true });
    expect(request.mock.calls.map((c) => c[0])).toEqual(["GET", "PUT"]);
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
    expect(c.endDate).toBe("2026-11-23");
    const [inv] = await db.select().from(schema.clientInvoices);
    expect(inv.dueDate).toBe("2026-11-23");
    expect((await db.select().from(schema.auditEvents))[0]).toMatchObject({ action: "invoice.due_date_moved", actor: "Hana Aziz" });
    expect((await getBalanceProposal(campaign.id))?.proposal).toBeNull();
  });
  it("only changes our records when the invoice isn't in PayPal yet", async () => {
    const { campaign } = await lateCampaign(null);
    const { pp, request } = fakePayPal();
    expect(await approveBalanceMove(pp, { campaignId: campaign.id, newDueDate: "2026-11-23", actor: "Wanz" })).toEqual({ ok: true });
    expect(request).not.toHaveBeenCalled();
  });
  it("changes nothing if PayPal refuses, or if the proposal is out of date", async () => {
    const { campaign } = await lateCampaign();
    expect(await approveBalanceMove(fakePayPal(true).pp, { campaignId: campaign.id, newDueDate: "2026-11-23", actor: "Wanz" })).toEqual({
      ok: false,
      reason: "PayPal refused the new due date (HTTP 422)",
    });
    expect((await db.select().from(schema.clientInvoices))[0].dueDate).toBe("2026-11-20");
    expect(await approveBalanceMove(fakePayPal().pp, { campaignId: campaign.id, newDueDate: "2026-11-25", actor: "Wanz" })).toEqual({
      ok: false,
      reason: "This proposal is out of date. Reload the page.",
    });
  });
});
```

Run the three test files → FAIL.

- [ ] **Step 2: Implement**

Create `src/lib/domain/balance.ts`:
```ts
import { addDays } from "@/lib/events";
import { formatDay } from "./format";
import { daysBetween } from "./reschedule";

// R19: if a deliverable now lands after the campaign end, push the end and the unpaid balance invoice with it,
// keeping the original gap between the two.
export function balanceProposal(input: {
  endDate: string;
  latest: { dueDate: string; creatorName: string } | null;
  balance: { dueDate: string; status: "draft" | "sent" | "paid" } | null;
}): { newEndDate: string; newDueDate: string; reason: string } | null {
  const { endDate, latest, balance } = input;
  if (!latest || latest.dueDate <= endDate) return null;
  if (!balance || balance.status === "paid") return null;
  const gap = Math.max(0, daysBetween(endDate, balance.dueDate));
  const newDueDate = addDays(latest.dueDate, gap);
  if (newDueDate <= balance.dueDate) return null;
  return {
    newEndDate: latest.dueDate,
    newDueDate,
    reason: `${latest.creatorName} now delivers ${formatDay(latest.dueDate)}, after the campaign end (${formatDay(endDate)}).`,
  };
}
```

Add to `src/lib/paypal/invoicing.ts`:
```ts
// R19: PayPal has no partial invoice update: read the whole invoice, change the due date, put it back.
// send_to_recipient=false: the client isn't emailed again for a date change.
export async function updateInvoiceDueDate(pp: PayPalClient, invoiceId: string, dueDate: string): Promise<void> {
  const inv = await pp.request<Record<string, unknown> & { detail: Record<string, unknown> & { payment_term?: Record<string, unknown> } }>(
    "GET",
    `/v2/invoicing/invoices/${invoiceId}`,
  );
  const { links: _links, ...rest } = inv as typeof inv & { links?: unknown };
  const body = { ...rest, detail: { ...inv.detail, payment_term: { ...inv.detail.payment_term, term_type: "DUE_ON_DATE_SPECIFIED", due_date: dueDate } } };
  await pp.request("PUT", `/v2/invoicing/invoices/${invoiceId}?send_to_recipient=false&send_to_invoicer=false`, body);
}
```

Create `src/lib/services/balance.ts`:
```ts
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { balanceProposal } from "@/lib/domain/balance";
import { PayPalError, type PayPalClient } from "@/lib/paypal/client";
import { updateInvoiceDueDate } from "@/lib/paypal/invoicing";
import { isUuid } from "@/lib/uuid";
import type { ActionResult } from "./payouts";

export async function getBalanceProposal(campaignId: string) {
  if (!isUuid(campaignId)) return null;
  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!campaign) return null;
  const [balance] = await db
    .select()
    .from(schema.clientInvoices)
    .where(and(eq(schema.clientInvoices.campaignId, campaignId), eq(schema.clientInvoices.kind, "balance")));
  const [latest] = await db
    .select({ dueDate: schema.assignments.dueDate, creatorName: schema.creators.name })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .where(eq(schema.assignments.campaignId, campaignId))
    .orderBy(desc(schema.assignments.dueDate))
    .limit(1);
  return { campaign, balance: balance ?? null, proposal: balanceProposal({ endDate: campaign.endDate, latest: latest ?? null, balance: balance ?? null }) };
}

// PayPal first, then our records: if PayPal refuses, nothing changes on either side.
export async function approveBalanceMove(pp: PayPalClient, input: { campaignId: string; newDueDate: string; actor: string }): Promise<ActionResult> {
  const current = await getBalanceProposal(input.campaignId);
  if (!current?.proposal || !current.balance || current.proposal.newDueDate !== input.newDueDate) {
    return { ok: false, reason: "This proposal is out of date. Reload the page." };
  }
  const { campaign, balance, proposal } = current;
  if (balance.paypalInvoiceId) {
    try {
      await updateInvoiceDueDate(pp, balance.paypalInvoiceId, proposal.newDueDate);
    } catch (err) {
      console.error("[paypal] invoice due date update failed", err);
      return { ok: false, reason: err instanceof PayPalError ? `PayPal refused the new due date (HTTP ${err.status})` : "PayPal couldn't be reached" };
    }
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.campaigns).set({ endDate: proposal.newEndDate }).where(eq(schema.campaigns.id, campaign.id));
    await tx.update(schema.clientInvoices).set({ dueDate: proposal.newDueDate }).where(eq(schema.clientInvoices.id, balance.id));
    await writeAudit(tx, {
      campaignId: campaign.id,
      actor: input.actor,
      action: "invoice.due_date_moved",
      detail: { reason: proposal.reason, before: { dueDate: balance.dueDate, campaignEnd: campaign.endDate }, after: { dueDate: proposal.newDueDate, campaignEnd: proposal.newEndDate }, paypalInvoiceId: balance.paypalInvoiceId },
    });
  });
  return { ok: true };
}
```

Run the three test files → PASS.

- [ ] **Step 3: The proposal on screen**

Add to `src/app/campaigns/[id]/actions.ts` (imports: `approveBalanceMove` from `@/lib/services/balance`):
```ts
export async function approveBalanceMoveAction(form: FormData) {
  const campaignId = text(form, "campaignId");
  const view = text(form, "view") === "calendar" ? "calendar" : "team";
  const r = await approveBalanceMove(payPalFromEnv(), { campaignId, newDueDate: text(form, "newDueDate"), actor: actorFrom(form) });
  backTo(`/campaigns/${campaignId}/${view}`, r.ok ? "Balance invoice due date moved." : r.reason);
}
```

Create `src/components/BalanceProposal.tsx`:
```tsx
import { approveBalanceMoveAction } from "@/app/campaigns/[id]/actions";
import ActorSelect from "@/components/ActorSelect";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/lib/domain/format";
import { formatUsd } from "@/lib/domain/money";
import { getBalanceProposal } from "@/lib/services/balance";

export default async function BalanceProposal({ campaignId, view }: { campaignId: string; view: "team" | "calendar" }) {
  const current = await getBalanceProposal(campaignId);
  if (!current?.proposal || !current.balance) return null;
  const { proposal, balance } = current;
  return (
    <form action={approveBalanceMoveAction} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="newDueDate" value={proposal.newDueDate} />
      <input type="hidden" name="view" value={view} />
      <span className="flex-1">
        <strong className="font-semibold">Move the balance invoice?</strong> {proposal.reason} Push the {formatUsd(balance.amountCents)} balance from{" "}
        {formatDay(balance.dueDate)} to {formatDay(proposal.newDueDate)}
        {balance.paypalInvoiceId ? " (updates the PayPal invoice)" : ""}.
      </span>
      <ActorSelect id={`balance-actor-${view}`} />
      <button className={buttonVariants({ size: "sm" })}>Approve new due date</button>
    </form>
  );
}
```

In `src/app/campaigns/[id]/team/page.tsx`, import `BalanceProposal` and render `<BalanceProposal campaignId={id} view="team" />` right after `<DepositPanel campaignId={id} />`.

In `src/app/campaigns/[id]/calendar/page.tsx`, take `searchParams` like the Team page so the result notice shows (imports: `BalanceProposal`, `Notice`):
```tsx
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

export default function CalendarPage({ params, searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading campaign…</p>}>
        <CalendarContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CalendarContent({ params, searchParams }: Props) {
  const { id } = await params;
  const { notice } = await searchParams;
  const data = await loadTimeline(id);
  if (!data) notFound();
  const clientName = data.resources.find((r) => r.id === "client")?.name ?? "";
  return (
    <>
      <CampaignHeader campaign={data.campaign} clientName={clientName} active="calendar" />
      <Notice text={notice} />
      <BalanceProposal campaignId={id} view="calendar" />
      <div className="flex justify-end">
        <ActorSelect id="view-actor" />
      </div>
      <CampaignCalendar resources={data.resources} events={data.events} date={data.campaign.startDate} />
    </>
  );
}
```
(`ActorSelect` was added to this page in Task 8.)

- [ ] **Step 4: Check against the sandbox**

`npm run db:seed:fresh`, tunnel optional, `npm run dev`. On the Team view click **Create balance draft** (so the invoice exists in PayPal).

Expected:
- Drag @mira.travels's post past Nov 20 (to Nov 23) → amber "Move the balance invoice? @mira.travels now delivers …" with "(updates the PayPal invoice)".
- **Approve new due date** → "Balance invoice due date moved."; the balance chip moves to Nov 23 in both views; the sandbox dashboard shows the draft `OT-…-BAL` due Nov 23.
- Repeat after **sending** a balance invoice (send it from the PayPal dashboard): if PayPal refuses to update a sent invoice, the notice says "PayPal refused the new due date (HTTP …)" and nothing changes. Record which in the Phase 3 notes (architecture §9 asked for this check).

- [ ] **Step 5: Commit**

```bash
npm test && npm run test:int && npm run build
git add src
git status
git commit -m "feat: propose and apply a new balance due date when a deliverable slips past the campaign end"
```

---

### Task 10: Local demo run-through and Phase 3 notes (45 min)

No hosting in Phase 3. The demo runs on your laptop; PayPal reaches it through the tunnel.

**Files:**
- Modify: this plan (Phase 3 notes), `docs/test-plan.html` (Phase 3 cases), `docs/prd.html` (Q7 result)

- [ ] **Step 1: Start everything**

```bash
make up
npm run db:seed:roster
npm run dev
cloudflared tunnel --url http://localhost:3000   # second terminal; update the webhook URL in PayPal if it changed
```

- [ ] **Step 2: The PRD demo script, end to end**

1. **Contract in, timeline out:** upload `eval/files/contract-kopi-kita.pdf` → review → Create campaign → both views fill.
2. **Client pays:** Send deposit invoice → pay as the sandbox client → green banner without reload (or **Check payment**).
3. **Influencer verified and paid:** Verify @aina.eats's post → approve → it shows lime "Scheduled" on both views → Send now → turns green "Paid" via the webhook.
4. **Freelancer mismatch caught:** `eval/files/invoice-bad-amount.pdf` on Daniel → **Read with AI** → held (its email differs from the sandbox one too, so expect two red rows); then a matching invoice → matches.
5. **Drag to reschedule:** in the Calendar, drag @mira.travels past Nov 20 → the payout moves, the balance proposal appears → approve → the PayPal invoice due date updates.
6. **Close on the numbers:** the Audit log shows every step with Mei, Hana or `paypal`.
7. **Daily run (R25):** with an approved payout dated today, run the `run-due` curl from the test plan (C2/C3) → it is sent. Without hosting there is no scheduler; Phase 4's Vercel cron would call the same route.

Time each step against the PRD's video timings; note anything slow.

- [ ] **Step 3: Test plan**

Add Phase 3 cards to `docs/test-plan.html` in its existing format: **AI** (Read with AI match/hold, AI unreachable → type fallback, contract upload → review → create, edits kept on error, PDF-only), **Views** (overdue colour, side panel + Esc, 3 s refresh across two windows, week layout), **Drag** (Calendar and Team drag, past day refused, approved payout reset, no cross-row drag), **Balance** (proposal, approve updates PayPal).

- [ ] **Step 4: Phase 3 notes**

Add a "Phase 3 notes" section at the bottom of this plan: eval results per model (invoices and contracts), whether Sonnet was needed, AI latency per document, whether PayPal accepts a due-date update on a **sent** invoice, and anything the demo run-through showed. Update PRD **Q7** with the eval result. Phase 4 is written from these notes.

- [ ] **Step 5: Commit**

```bash
npm test && npm run test:int && npm run build
git add docs
git status   # .env must not be listed
git commit -m "docs: phase 3 checkpoint, eval results and demo notes"
```

---

## Cut order if behind

Phase 3 is about 10 hours against an 8–9 hour week. Cut from the bottom, never the guardrails or webhooks:
1. Task 9 (balance proposal) → Phase 4; the drag still moves payout dates.
2. Task 6's live totals → plain fields (the server still validates).
3. Contract eval cases (Task 4 Step 5–6) → keep the invoice eval only.
4. Task 8 Calendar drag → Team drag only.

Never cut: the AI-reads/code-decides split, the guardrails, or the webhook-driven updates.

## What comes next

| Phase | Dates | Covers |
|---|---|---|
| **4: Polish** | Nov 2–8 | Eval targets met on the chosen model, reset-demo button (reseed roster), README with judge setup steps, sandbox accounts and the tunnel (judges must be able to run it or open a URL), optional hosting on Vercel (hosted Postgres such as Neon, Vercel Cron calling `/api/payouts/run-due`, uploads under Vercel's 4.5 MB request limit), MIT licence, retry for failed payouts, campaign summary (R20), AI post pre-check (R24), agent command bar with Claude-written proposals (R22), Task 9 if cut |
| **Submit** | Nov 9–11 | Video (≤ 2:50), Devpost text, submit Nov 11 |
