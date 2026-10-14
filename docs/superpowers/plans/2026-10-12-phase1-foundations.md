# On-Track Phase 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Next.js app with the payout safety rules tested, a working PayPal sandbox connection (invoice + payout proven), a seeded Postgres database, and the campaign shown in Bryntum Scheduler and Calendar.

**Architecture:** One Next.js (App Router, TypeScript) app. Pure domain rules live in `src/lib/domain/` with no I/O so they can be unit-tested. PayPal is called through a small typed REST client in `src/lib/paypal/`. Postgres via Drizzle ORM. Bryntum components render client-side only.

**Tech Stack:** Next.js + TypeScript, Tailwind + shadcn/ui, Vitest, Drizzle ORM + postgres-js, PostgreSQL 15 (Docker Compose), PayPal REST API (sandbox), Bryntum Scheduler + Calendar (trial), tsx for scripts.

**Spec:** `docs/prd.html` (requirements R1–R26, questions Q1–Q7) and `docs/architecture.html` (stack, data model, guardrails, PayPal endpoints, build plan).

## Global Constraints

- Currency: **USD only** (PRD Q4).
- Money is stored and passed as **integer cents** everywhere. Convert to a PayPal string only at the API edge.
- Dates are plain **`YYYY-MM-DD` strings**, compared as strings. No `Date` objects for calendar days (timezone safety: Malaysia is UTC+8).
- Payout idempotency: PayPal `sender_batch_id` and `sender_item_id` = our payout row id.
- **Every payout needs human approval** before it is scheduled (R17). No auto-approve.
- Payout amount may never exceed the assignment's contract fee (R16). Edits may lower it, never raise it (R26).
- `.env` is never committed. The repo will be public.
- Sandbox only: `PAYPAL_API_BASE=https://api-m.sandbox.paypal.com`.

## Review Focus

1. **Double send.** "Send now" clicked twice, or clicked while the daily job runs → must not pay twice. Pinned in Task 3: same payout id always yields the same `sender_batch_id`.
2. **Client deposit falls through after approval.** A payout approved while the deposit was cleared, then the deposit flag goes false → send must be denied. Pinned in Task 2: `canPay` denies an *approved* payout when `depositCleared` is false.
3. **Cents rounding.** $1,000.10 must reach PayPal as `"1000.10"`, never `"1000.1"` or `"1000.0999"`. Pinned in Task 3: `toPayPalValue`.
4. **Today is a valid payout date.** Editing a payout to today's date must be accepted; yesterday rejected; no timezone shift. Pinned in Task 2: `validatePayoutEdit` with `today` equal to the new date.
5. **Junk edit amounts.** 0, negative, fractional cents, or above the fee must be rejected with a readable reason. Pinned in Task 2.

---

## Before you start (about 30 minutes, once)

These are accounts and keys only you can create.

- [ ] **PayPal sandbox app.** Go to developer.paypal.com → log in → toggle **Sandbox** → **Apps & Credentials** → **Create App** (type Merchant, linked to the default sandbox business account). Copy the **Client ID** and **Secret**.
- [ ] **Sandbox test accounts.** Developer dashboard → **Testing tools → Sandbox accounts**. Note the email of the default **Personal** account. It will act as both "client" (pays invoices) and "creator" (receives payouts) for now.
- [ ] **Bryntum trials.** Download Scheduler and Calendar trials on the same day (bryntum.com/download). Note any npm registry login instructions they give you.
- [ ] **Anthropic API key** is *not* needed in Phase 1. On-Track's own AI features start in Phase 3; create the key at console.anthropic.com then.

---

### Task 0: Coding-agent setup (about 20 minutes)

Set up Claude Code so it knows PayPal and this project's rules before any code is written. Uses the Client ID and Secret from "Before you start".

**Files:**
- Already created: `CLAUDE.md` (project rules for any coding agent; committed in Task 1)
- Create: `.claude/settings.json` (project permissions)
- Modify (your machine only, never the repo): `~/.claude/settings.json`

- [ ] **Step 1: Install the PayPal AI Toolkit plugin**

Inside Claude Code:
```
/plugin install paypal@claude-plugins-official
/reload-plugins
```
It adds PayPal best-practice skills, a pre-write check hook, the PayPal sandbox MCP server, and commands like `/paypal:explain-error`.

- [ ] **Step 2: Give the PayPal plugin a sandbox token**

In a terminal (fill in your sandbox Client ID and Secret):
```bash
curl -s -X POST https://api-m.sandbox.paypal.com/v1/oauth2/token \
  -u "YOUR_SANDBOX_CLIENT_ID:YOUR_SANDBOX_CLIENT_SECRET" \
  -d "grant_type=client_credentials" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])"
```
Copy the single-line token into the `"env"` block of `~/.claude/settings.json` (create the block if it isn't there):
```json
"env": {
  "PAYPAL_SANDBOX_ACCESS_TOKEN": "A21AA…"
}
```
Fully quit Claude Code and reopen it, then run `/paypal:setup`.
Expected: it reports the sandbox MCP server connected.

The token expires within about 8 hours. When PayPal tools return 401, run `/paypal:setup refresh`. This token lives only in your user settings, never in the repo.

- [ ] **Step 3: Install the APIMatic Context Plugin for PayPal**

```bash
npx context-plugins install paypal
```
It adds APIMatic's marketplace and runs `claude plugin install` at user scope. Restart Claude Code and check `/plugin` lists it.

Then claim the free APIMatic subscription with the form on the hackathon's APIMatic page. Using this plugin to build the PayPal integration is what makes you eligible for the **Best Use of APIMatic** prize, so in Task 3 ask it how to call Invoicing and Payouts and keep a note of what it helped with. That note goes in the Devpost write-up.

Note: the plugin mainly covers PayPal's official TypeScript server SDK, while this plan calls Invoicing and Payouts through a small REST client. If the plugin shows the SDK covers both cleanly, it's fine to use the SDK inside `src/lib/paypal/` instead; keep the same function names and tests.

- [ ] **Step 4: Project permissions**

Create `.claude/settings.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(npm test:*)",
      "Bash(npm run test:*)",
      "Bash(npm run build)",
      "Bash(npm run db:*)",
      "Bash(git status)",
      "Bash(git diff:*)"
    ],
    "deny": [
      "Read(./.env)"
    ]
  }
}
```
This lets agents run tests and builds without asking each time, and stops them from reading your real keys.

- [ ] **Step 5: Check everything in a fresh session**

Open a new Claude Code session in `~/on-track` and ask:
1. "What are the money rules in this project?" → it should quote cents, string dates, and `canPay()` from `CLAUDE.md`.
2. "List the PayPal MCP tools you have." → invoice, order, subscription and dispute tools (no payouts, which is expected).
3. `/paypal:explain-error 422 UNPROCESSABLE_ENTITY` → an explanation, proving the PayPal plugin works.

---

### Task 1: Project scaffold

**Files:**
- Create (by generator): `package.json`, `src/app/*`, `tsconfig.json`, `.gitignore`, `next.config.ts`, etc.
- Create: `vitest.config.ts`, `src/lib/smoke.test.ts`, `.env.example`, `LICENSE`, `README.md`
- Keep: `docs/` (already there)

**Interfaces:**
- Produces: `npm test` (Vitest), `npm run dev`, `@/` import alias → `src/`.

- [ ] **Step 1: Generate the Next.js app into the existing folder**

Run from `~/on-track`:
```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```
Expected: it installs and finishes. If it refuses because the folder isn't empty, move `docs/` out temporarily (`mv docs ../on-track-docs`), run it, then move it back (`mv ../on-track-docs docs`).

- [ ] **Step 2: Add test and script tooling**

```bash
npm install -D vitest tsx
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Write a smoke test**

Create `src/lib/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: `1 passed`.

- [ ] **Step 4: Initialise shadcn/ui**

```bash
npx shadcn@latest init
```
Pick the defaults (Neutral or Zinc base colour matches the prototype). Then:
```bash
npx shadcn@latest add button input label badge table dialog textarea checkbox
```

- [ ] **Step 5: Environment files**

Create `.env.example`:
```bash
DATABASE_URL=postgres://localhost:5432/ontrack
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
PAYPAL_WEBHOOK_ID=
SANDBOX_CLIENT_EMAIL=
SANDBOX_CREATOR_EMAIL=
ANTHROPIC_API_KEY=
AI_MODEL=claude-haiku-5-5
CRON_SECRET=
APP_URL=http://localhost:3000
```
Copy it: `cp .env.example .env`, then fill in the PayPal Client ID, Secret and the sandbox Personal email (for both `SANDBOX_CLIENT_EMAIL` and `SANDBOX_CREATOR_EMAIL`).

- [ ] **Step 6: Prove `.env` is ignored**

Run: `git check-ignore -v .env`
Expected: a line naming `.gitignore` and a pattern like `.env*`. **If it prints nothing, stop** and add `.env` to `.gitignore` before anything else.

Also make sure the example file is *not* ignored: `git check-ignore .env.example` should print nothing. If it is ignored, add `!.env.example` to `.gitignore`.

- [ ] **Step 7: Licence and README stub**

Create `LICENSE` with the standard MIT text, `Copyright (c) 2026 ngwanqin`.

Create `README.md`:
```markdown
# On-Track

AI payment desk for marketing agencies: collect from clients, pay influencers when posts go live, pay freelancers against signed contracts.

Built for the PayPal AI Hackathon 2026. Docs: `docs/index.html`.

## Run locally
1. `cp .env.example .env` and fill in PayPal sandbox keys.
2. `npm install`
3. `npm run dev`
```

- [ ] **Step 8: Verify and commit**

Run: `npm test && npm run build`
Expected: test passes, build succeeds.

```bash
git add -A
git status   # confirm .env is NOT listed
git commit -m "chore: scaffold Next.js app with Vitest, shadcn, env template"
```

---

### Task 2: Payout safety rules (`canPay`, `validatePayoutEdit`)

The core of the product. Pure functions, no database, no PayPal.

**Files:**
- Create: `src/lib/domain/types.ts`
- Create: `src/lib/domain/guardrails.ts`
- Test: `src/lib/domain/guardrails.test.ts`

**Interfaces:**
- Produces:
  - `canPay(input: { campaign: Campaign; assignment: Assignment; verification: Verification | null; payout: Payout }): PayDecision`
  - `validatePayoutEdit(input: { payout: Payout; assignment: Assignment; newAmountCents: number; newDate: string; reason: string; today: string }): EditResult`
  - Types `Campaign`, `Assignment`, `Verification`, `Payout`, `PayDecision`, `EditResult`, `PayoutStatus`, `AssignmentStatus`.

- [ ] **Step 1: Write the types**

Create `src/lib/domain/types.ts`:
```ts
export type AssignmentStatus = "scheduled" | "submitted" | "verified" | "held" | "paid";
export type PayoutStatus = "awaiting_approval" | "scheduled" | "payout_sent" | "paid" | "payout_failed" | "held";

export interface Campaign {
  id: string;
  depositCleared: boolean;
}

export interface Assignment {
  id: string;
  feeCents: number;
  status: AssignmentStatus;
}

export interface Verification {
  pass: boolean;
  source: "user" | "ai";
}

export interface Payout {
  id: string;
  amountCents: number;
  status: PayoutStatus;
  approvedBy: string | null;
  scheduledFor: string; // YYYY-MM-DD
}

export type PayDecision =
  | { kind: "allow" }
  | { kind: "needs_approval"; reason: string }
  | { kind: "deny"; reason: string };

export type EditResult =
  | { ok: true; resetApproval: boolean }
  | { ok: false; errors: string[] };
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/domain/guardrails.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { canPay, validatePayoutEdit } from "./guardrails";
import type { Assignment, Campaign, Payout, Verification } from "./types";

const campaign: Campaign = { id: "c1", depositCleared: true };
const assignment: Assignment = { id: "a1", feeCents: 120000, status: "verified" };
const verified: Verification = { pass: true, source: "user" };
const approved: Payout = { id: "p1", amountCents: 120000, status: "scheduled", approvedBy: "mei", scheduledFor: "2026-10-29" };

describe("canPay", () => {
  it("allows an approved, verified payout within the fee when the deposit has cleared", () => {
    expect(canPay({ campaign, assignment, verification: verified, payout: approved })).toEqual({ kind: "allow" });
  });

  it("denies when the client deposit has not cleared, even if already approved", () => {
    const r = canPay({ campaign: { ...campaign, depositCleared: false }, assignment, verification: verified, payout: approved });
    expect(r).toEqual({ kind: "deny", reason: "Client deposit not received" });
  });

  it("denies when the payout was already sent", () => {
    const r = canPay({ campaign, assignment, verification: verified, payout: { ...approved, status: "payout_sent" } });
    expect(r).toEqual({ kind: "deny", reason: "Already paid" });
  });

  it("denies when the assignment is already paid", () => {
    const r = canPay({ campaign, assignment: { ...assignment, status: "paid" }, verification: verified, payout: approved });
    expect(r).toEqual({ kind: "deny", reason: "Already paid" });
  });

  it("denies when the work is not verified", () => {
    expect(canPay({ campaign, assignment, verification: null, payout: approved })).toEqual({ kind: "deny", reason: "Work not verified" });
    expect(canPay({ campaign, assignment, verification: { pass: false, source: "ai" }, payout: approved })).toEqual({ kind: "deny", reason: "Work not verified" });
  });

  it("denies when the amount is above the contract fee", () => {
    const r = canPay({ campaign, assignment, verification: verified, payout: { ...approved, amountCents: 120001 } });
    expect(r).toEqual({ kind: "deny", reason: "Exceeds contracted fee" });
  });

  it("asks for approval when nobody has approved it yet", () => {
    const r = canPay({ campaign, assignment, verification: verified, payout: { ...approved, status: "awaiting_approval", approvedBy: null } });
    expect(r).toEqual({ kind: "needs_approval", reason: "Waiting for approval" });
  });
});

describe("validatePayoutEdit", () => {
  const base = { payout: approved, assignment, newAmountCents: 100000, newDate: "2026-11-02", reason: "Creator asked to be paid after month end", today: "2026-10-27" };

  it("accepts a lower amount and a later date, and resets approval for a scheduled payout", () => {
    expect(validatePayoutEdit(base)).toEqual({ ok: true, resetApproval: true });
  });

  it("does not reset approval when the payout was still awaiting approval", () => {
    const r = validatePayoutEdit({ ...base, payout: { ...approved, status: "awaiting_approval", approvedBy: null } });
    expect(r).toEqual({ ok: true, resetApproval: false });
  });

  it("accepts today as the payout date", () => {
    expect(validatePayoutEdit({ ...base, newDate: "2026-10-27" }).ok).toBe(true);
  });

  it("rejects a date in the past", () => {
    expect(validatePayoutEdit({ ...base, newDate: "2026-10-26" })).toEqual({ ok: false, errors: ["Payout date can't be in the past"] });
  });

  it("rejects an amount above the contract fee", () => {
    expect(validatePayoutEdit({ ...base, newAmountCents: 120001 })).toEqual({ ok: false, errors: ["Amount is above the contract fee"] });
  });

  it("rejects zero, negative and fractional-cent amounts", () => {
    for (const bad of [0, -100, 100.5]) {
      expect(validatePayoutEdit({ ...base, newAmountCents: bad })).toEqual({ ok: false, errors: ["Amount must be a positive whole number of cents"] });
    }
  });

  it("rejects a blank reason", () => {
    expect(validatePayoutEdit({ ...base, reason: "   " })).toEqual({ ok: false, errors: ["A reason is required"] });
  });

  it("rejects edits to a payout that was already sent or paid", () => {
    for (const status of ["payout_sent", "paid"] as const) {
      expect(validatePayoutEdit({ ...base, payout: { ...approved, status } })).toEqual({ ok: false, errors: ["This payout was already sent"] });
    }
  });

  it("reports every problem at once", () => {
    const r = validatePayoutEdit({ ...base, newAmountCents: 0, newDate: "2026-10-01", reason: "" });
    expect(r).toEqual({ ok: false, errors: ["Amount must be a positive whole number of cents", "Payout date can't be in the past", "A reason is required"] });
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test -- src/lib/domain/guardrails.test.ts`
Expected: FAIL, "Failed to resolve import ./guardrails" (or similar).

- [ ] **Step 4: Implement**

Create `src/lib/domain/guardrails.ts`:
```ts
import type { Assignment, Campaign, EditResult, PayDecision, Payout, Verification } from "./types";

const SENT: Payout["status"][] = ["payout_sent", "paid"];

export function canPay(input: {
  campaign: Campaign;
  assignment: Assignment;
  verification: Verification | null;
  payout: Payout;
}): PayDecision {
  const { campaign, assignment, verification, payout } = input;
  if (!campaign.depositCleared) return { kind: "deny", reason: "Client deposit not received" }; // R15
  if (assignment.status === "paid" || SENT.includes(payout.status)) return { kind: "deny", reason: "Already paid" }; // R16
  if (!verification?.pass) return { kind: "deny", reason: "Work not verified" };
  if (payout.amountCents > assignment.feeCents) return { kind: "deny", reason: "Exceeds contracted fee" }; // R16
  if (!payout.approvedBy) return { kind: "needs_approval", reason: "Waiting for approval" }; // R17
  return { kind: "allow" };
}

export function validatePayoutEdit(input: {
  payout: Payout;
  assignment: Assignment;
  newAmountCents: number;
  newDate: string;
  reason: string;
  today: string;
}): EditResult {
  const { payout, assignment, newAmountCents, newDate, reason, today } = input;
  if (SENT.includes(payout.status)) return { ok: false, errors: ["This payout was already sent"] };

  const errors: string[] = [];
  if (!Number.isInteger(newAmountCents) || newAmountCents <= 0) {
    errors.push("Amount must be a positive whole number of cents");
  } else if (newAmountCents > assignment.feeCents) {
    errors.push("Amount is above the contract fee");
  }
  if (newDate < today) errors.push("Payout date can't be in the past"); // YYYY-MM-DD strings compare correctly
  if (!reason.trim()) errors.push("A reason is required");

  if (errors.length) return { ok: false, errors };
  return { ok: true, resetApproval: payout.status === "scheduled" };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: all tests pass (1 smoke + 15 guardrail tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain
git commit -m "feat: payout guardrails (canPay, validatePayoutEdit) with tests"
```

---

### Task 3: PayPal client + sandbox smoke test (answers PRD Q1)

**Files:**
- Create: `src/lib/paypal/client.ts`
- Create: `src/lib/paypal/money.ts`
- Create: `src/lib/paypal/invoicing.ts`
- Create: `src/lib/paypal/payouts.ts`
- Test: `src/lib/paypal/paypal.test.ts`
- Create: `scripts/paypal-smoke.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `createPayPalClient(cfg: PayPalConfig, fetchImpl?: typeof fetch, now?: () => number): PayPalClient`
  - `PayPalClient = { getToken(): Promise<string>; request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> }`
  - `PayPalError` (has `.status`, `.body`)
  - `toPayPalValue(cents: number): string`
  - `createInvoice(pp, { invoiceNumber, recipientEmail, itemName, amountCents, dueDate }): Promise<{ id: string; status: string }>`
  - `sendInvoice(pp, invoiceId): Promise<void>`
  - `buildPayoutBody({ payoutId, receiverEmail, amountCents, note })` (pure)
  - `createPayout(pp, { payoutId, receiverEmail, amountCents, note }): Promise<{ batchId: string; status: string }>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/paypal/paypal.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createPayPalClient, PayPalError } from "./client";
import { toPayPalValue } from "./money";
import { buildPayoutBody } from "./payouts";

const cfg = { clientId: "id", clientSecret: "secret", baseUrl: "https://api-m.sandbox.paypal.com" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("toPayPalValue", () => {
  it("formats cents as a 2-decimal string", () => {
    expect(toPayPalValue(100010)).toBe("1000.10");
    expect(toPayPalValue(120000)).toBe("1200.00");
    expect(toPayPalValue(5)).toBe("0.05");
  });
  it("rejects non-integer or negative cents", () => {
    expect(() => toPayPalValue(100.5)).toThrow();
    expect(() => toPayPalValue(-1)).toThrow();
  });
});

describe("createPayPalClient", () => {
  it("caches the access token until shortly before it expires", async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => json({ access_token: "tok", expires_in: 3600 }));
    const pp = createPayPalClient(cfg, fetchImpl as unknown as typeof fetch, () => t);
    await pp.getToken();
    t = 3_000_000; // 50 min later, still valid
    await pp.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 3_560_000; // inside the last minute → refresh
    await pp.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws PayPalError with status and body on a failed request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('{"name":"VALIDATION_ERROR"}', { status: 422 }));
    const pp = createPayPalClient(cfg, fetchImpl as unknown as typeof fetch);
    await expect(pp.request("POST", "/v1/payments/payouts", {})).rejects.toMatchObject({ status: 422 });
    await expect(Promise.reject(new PayPalError(422, "x"))).rejects.toBeInstanceOf(PayPalError);
  });
});

describe("buildPayoutBody", () => {
  it("uses the payout id as the idempotency key, so a retry can't pay twice", () => {
    const a = buildPayoutBody({ payoutId: "p-123", receiverEmail: "c@example.com", amountCents: 120000, note: "Kopi Kita" });
    const b = buildPayoutBody({ payoutId: "p-123", receiverEmail: "c@example.com", amountCents: 120000, note: "Kopi Kita" });
    expect(a.sender_batch_header.sender_batch_id).toBe("p-123");
    expect(a.items[0].sender_item_id).toBe("p-123");
    expect(a).toEqual(b);
    expect(a.items[0].amount).toEqual({ value: "1200.00", currency: "USD" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- src/lib/paypal`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the client**

Create `src/lib/paypal/client.ts`:
```ts
export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

export class PayPalError extends Error {
  constructor(public status: number, public body: string) {
    super(`PayPal ${status}: ${body}`);
    this.name = "PayPalError";
  }
}

export type PayPalClient = ReturnType<typeof createPayPalClient>;

export function createPayPalClient(cfg: PayPalConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const res = await fetchImpl(`${cfg.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new PayPalError(res.status, await res.text());
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: now() + body.expires_in * 1000 };
    return token.value;
  }

  async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetchImpl(`${cfg.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new PayPalError(res.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  return { getToken, request };
}

export function payPalFromEnv(): PayPalClient {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_API_BASE) {
    throw new Error("Missing PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET or PAYPAL_API_BASE in .env");
  }
  return createPayPalClient({ clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET, baseUrl: PAYPAL_API_BASE });
}
```

Create `src/lib/paypal/money.ts`:
```ts
export function toPayPalValue(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Invalid cents: ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
```

Create `src/lib/paypal/invoicing.ts`:
```ts
import type { PayPalClient } from "./client";
import { toPayPalValue } from "./money";

export async function createInvoice(
  pp: PayPalClient,
  input: { invoiceNumber: string; recipientEmail: string; itemName: string; amountCents: number; dueDate: string },
): Promise<{ id: string; status: string }> {
  const invoice = await pp.request<{ id: string; status: string }>(
    "POST",
    "/v2/invoicing/invoices",
    {
      detail: {
        invoice_number: input.invoiceNumber,
        currency_code: "USD",
        payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: input.dueDate },
      },
      primary_recipients: [{ billing_info: { email_address: input.recipientEmail } }],
      items: [{ name: input.itemName, quantity: "1", unit_amount: { currency_code: "USD", value: toPayPalValue(input.amountCents) } }],
    },
    { Prefer: "return=representation" },
  );
  return { id: invoice.id, status: invoice.status };
}

export async function sendInvoice(pp: PayPalClient, invoiceId: string): Promise<void> {
  await pp.request("POST", `/v2/invoicing/invoices/${invoiceId}/send`, { send_to_recipient: true });
}
```

Create `src/lib/paypal/payouts.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Write the sandbox smoke script**

Create `scripts/paypal-smoke.ts`:
```ts
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
```

Add to `package.json` scripts:
```json
"paypal:smoke": "tsx --env-file=.env scripts/paypal-smoke.ts"
```

- [ ] **Step 6: Run it against the sandbox**

Run: `npm run paypal:smoke`
Expected: four ✔ lines; the payout status is `PENDING` or `SUCCESS`.

Then log into sandbox.paypal.com with the sandbox **Personal** account: you should see the $1.00 invoice and the $1.00 payout.

If the payout step fails with a 403 or "AUTHORIZATION_ERROR", open the app in the developer dashboard and check that **Payouts** is enabled under the app's features. Record what you saw.

- [ ] **Step 7: Record the answer to Q1 and commit**

In `docs/prd.html`, Q1 row: change the status pill to "Answered" and write what happened (worked first time / needed the Payouts toggle).

```bash
git add src/lib/paypal scripts/paypal-smoke.ts package.json docs/prd.html
git commit -m "feat: PayPal REST client, invoicing and payouts; sandbox smoke test passes"
```

---

### Task 4: Database schema and seed data

**Files:**
- Create: `docker-compose.yml`
- Create: `Makefile`
- Modify: `.env.example` (and your local `.env`): `DATABASE_URL`
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`
- Create: `drizzle.config.ts`
- Create: `scripts/seed.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (types mirror Task 2's names).
- Produces: tables `clients`, `campaigns`, `creators`, `assignments`, `clientInvoices`, `payouts`, `auditEvents`; `db` export; `npm run db:push`, `npm run db:seed`. Seed prints the campaign id.

- [ ] **Step 1: Run Postgres in Docker**

Postgres runs in a container, so nothing is installed or left running on the Mac. The container creates the `ontrack` database on first start.

Create `docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: ontrack
      POSTGRES_PASSWORD: ontrack # local-only dev password, safe to commit
      POSTGRES_DB: ontrack
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

Set `DATABASE_URL` in **both** `.env.example` and `.env`:
```bash
DATABASE_URL=postgres://ontrack:ontrack@localhost:5432/ontrack
```

A `Makefile` wraps the Docker commands: `make up` (= `docker compose up -d --build --wait`), `make down`, `make logs`, `make ps`, `make psql`, `make db-push`, `make db-seed`, and `make db-reset` (wipes the volume, then push + seed).

Start it and check it answers:
```bash
make up
docker compose exec db psql -U ontrack ontrack -c "select 1"
```
Expected: a row with `1`.

If `up` fails with "port is already allocated", Homebrew Postgres is holding 5432: run `brew services stop postgresql@15`, or map `"5433:5432"` and use port `5433` in `DATABASE_URL`.

Day to day: `make up` to start, `make down` to stop. Data survives in the `pgdata` volume; `make db-reset` wipes it and re-seeds.

- [ ] **Step 2: Install Drizzle**

```bash
npm install drizzle-orm postgres dotenv
npm install -D drizzle-kit
```

- [ ] **Step 3: Write the schema**

Create `src/db/schema.ts`:
```ts
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
```

Create `src/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const db = drizzle(postgres(url), { schema });
export { schema };
```

Create `drizzle.config.ts`:
```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Add to `package.json` scripts:
```json
"db:push": "drizzle-kit push",
"db:seed": "tsx --env-file=.env scripts/seed.ts",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 4: Create the tables**

Run: `npm run db:push`
Expected: it lists the 7 tables and 5 enums and applies them.

Verify: `docker compose exec db psql -U ontrack ontrack -c "\dt"` lists `assignments`, `audit_events`, `campaigns`, `client_invoices`, `clients`, `creators`, `payouts`.

- [ ] **Step 5: Write the seed (the prototype's Kopi Kita campaign)**

Create `scripts/seed.ts`:
```ts
import { sql } from "drizzle-orm";
import { db, schema } from "../src/db";

async function main() {
  const sandbox = process.env.SANDBOX_CREATOR_EMAIL ?? "creator@example.com";
  const clientEmail = process.env.SANDBOX_CLIENT_EMAIL ?? "client@example.com";

  await db.execute(sql`truncate audit_events, payouts, client_invoices, assignments, creators, campaigns, clients restart identity cascade`);

  const [client] = await db.insert(schema.clients).values({ name: "Kopi Kita Sdn Bhd", email: clientEmail }).returning();
  const [campaign] = await db
    .insert(schema.campaigns)
    .values({ clientId: client.id, name: "Kopi Kita · Pagi Launch", startDate: "2026-10-19", endDate: "2026-11-20", depositCleared: true })
    .returning();

  const creatorRows = await db
    .insert(schema.creators)
    .values([
      { name: "@aina.eats", type: "influencer", detail: "Instagram", paypalEmail: sandbox },
      { name: "@jasonlifts", type: "influencer", detail: "TikTok", paypalEmail: sandbox },
      { name: "@mira.travels", type: "influencer", detail: "Instagram", paypalEmail: sandbox },
      { name: "Daniel Lim", type: "freelancer", detail: "Video edits", paypalEmail: sandbox },
    ])
    .returning();
  const [aina, jason, mira, daniel] = creatorRows;

  const a = await db
    .insert(schema.assignments)
    .values([
      { campaignId: campaign.id, creatorId: aina.id, deliverable: "1 Reel + 2 Stories", feeCents: 150000, dueDate: "2026-10-21", status: "paid" },
      { campaignId: campaign.id, creatorId: jason.id, deliverable: "1 TikTok video", feeCents: 120000, dueDate: "2026-10-24", status: "verified" },
      { campaignId: campaign.id, creatorId: mira.id, deliverable: "1 Reel", feeCents: 200000, dueDate: "2026-10-28", status: "scheduled" },
      { campaignId: campaign.id, creatorId: daniel.id, deliverable: "2 × 30s product video edits", feeCents: 100000, dueDate: "2026-10-27", status: "held" },
    ])
    .returning();

  await db.insert(schema.clientInvoices).values([
    { campaignId: campaign.id, kind: "deposit", amountCents: 600000, dueDate: "2026-10-16", status: "paid" },
    { campaignId: campaign.id, kind: "balance", amountCents: 600000, dueDate: "2026-11-20", status: "draft" },
  ]);

  await db.insert(schema.payouts).values([
    { assignmentId: a[0].id, amountCents: 150000, scheduledFor: "2026-10-23", approvedBy: "Mei Tan", approvedAt: new Date("2026-10-22T09:00:00+08:00"), status: "paid" },
    { assignmentId: a[1].id, amountCents: 120000, scheduledFor: "2026-10-29", status: "awaiting_approval" },
  ]);

  console.log(`Seeded campaign ${campaign.id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Run the seed**

Run: `npm run db:seed`
Expected: `Seeded campaign <uuid>`.

Verify: `docker compose exec db psql -U ontrack ontrack -c "select name, fee_cents, status from assignments join creators on creators.id = assignments.creator_id"` shows the 4 rows.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml Makefile .env.example src/db drizzle.config.ts scripts/seed.ts package.json package-lock.json
git status   # confirm .env is NOT listed
git commit -m "feat: Postgres schema (Drizzle) and Kopi Kita seed data"
```

---

### Task 5: Database rows → timeline events

A pure mapping, tested, so both Bryntum views read one shape.

**Files:**
- Create: `src/lib/events.ts`
- Test: `src/lib/events.test.ts`

**Interfaces:**
- Consumes: column names from Task 4 (`feeCents`, `dueDate`, `scheduledFor`, statuses).
- Produces:
  - `addDays(day: string, n: number): string`
  - `toTimeline(input: TimelineInput): { resources: TimelineResource[]; events: TimelineEvent[] }`
  - `TimelineEvent = { id; resourceId; name; startDate; endDate; eventColor; kind; draggable; resizable }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/events.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { addDays, toTimeline, type TimelineInput } from "./events";

const input: TimelineInput = {
  client: { id: "cl", name: "Kopi Kita Sdn Bhd" },
  assignments: [
    { id: "as1", creatorId: "cr1", creatorName: "@jasonlifts", creatorType: "influencer", dueDate: "2026-10-24", status: "verified", feeCents: 120000 },
    { id: "as2", creatorId: "cr2", creatorName: "Daniel Lim", creatorType: "freelancer", dueDate: "2026-10-27", status: "held", feeCents: 100000 },
  ],
  invoices: [{ id: "inv1", kind: "deposit", amountCents: 600000, dueDate: "2026-10-16", status: "paid" }],
  payouts: [{ id: "po1", assignmentId: "as1", amountCents: 120000, scheduledFor: "2026-10-29", status: "awaiting_approval" }],
};

describe("addDays", () => {
  it("adds days across a month boundary without timezone drift", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-27", 0)).toBe("2026-10-27");
  });
});

describe("toTimeline", () => {
  const { resources, events } = toTimeline(input);

  it("has a Client row first, then one row per creator", () => {
    expect(resources.map((r) => r.name)).toEqual(["Kopi Kita Sdn Bhd", "@jasonlifts", "Daniel Lim"]);
  });

  it("makes posts and deliverables draggable, invoices and payouts fixed", () => {
    const byId = Object.fromEntries(events.map((e) => [e.id, e]));
    expect(byId["assignment-as1"]).toMatchObject({ kind: "post", draggable: true, resourceId: "cr1", startDate: "2026-10-24", endDate: "2026-10-25" });
    expect(byId["assignment-as2"]).toMatchObject({ kind: "deliverable", draggable: true, eventColor: "red" });
    expect(byId["invoice-inv1"]).toMatchObject({ kind: "invoice", draggable: false, resourceId: "client", eventColor: "blue" });
    expect(byId["payout-po1"]).toMatchObject({ kind: "payout", draggable: false, resourceId: "cr1", eventColor: "yellow", name: "Awaiting approval $1,200" });
  });

  it("never lets an event be resized", () => {
    expect(events.every((e) => e.resizable === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/lib/events.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/lib/events.ts`:
```ts
export interface TimelineInput {
  client: { id: string; name: string };
  assignments: Array<{
    id: string;
    creatorId: string;
    creatorName: string;
    creatorType: "influencer" | "freelancer";
    dueDate: string;
    status: "scheduled" | "submitted" | "verified" | "held" | "paid";
    feeCents: number;
  }>;
  invoices: Array<{ id: string; kind: "deposit" | "balance"; amountCents: number; dueDate: string; status: "draft" | "sent" | "paid" }>;
  payouts: Array<{
    id: string;
    assignmentId: string;
    amountCents: number;
    scheduledFor: string;
    status: "awaiting_approval" | "scheduled" | "payout_sent" | "paid" | "payout_failed" | "held";
  }>;
}

export interface TimelineResource {
  id: string;
  name: string;
}

export interface TimelineEvent {
  id: string;
  resourceId: string;
  name: string;
  startDate: string;
  endDate: string;
  eventColor: string;
  kind: "post" | "deliverable" | "invoice" | "payout";
  draggable: boolean;
  resizable: false;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const usd = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

const PAYOUT_LABEL: Record<TimelineInput["payouts"][number]["status"], [string, string]> = {
  awaiting_approval: ["Awaiting approval", "yellow"],
  scheduled: ["Scheduled", "lime"],
  payout_sent: ["Sending", "green"],
  paid: ["Paid", "green"],
  payout_failed: ["Payout failed", "red"],
  held: ["Held", "red"],
};

export function toTimeline(input: TimelineInput): { resources: TimelineResource[]; events: TimelineEvent[] } {
  const resources: TimelineResource[] = [{ id: "client", name: input.client.name }];
  const seen = new Set<string>();
  for (const a of input.assignments) {
    if (!seen.has(a.creatorId)) {
      seen.add(a.creatorId);
      resources.push({ id: a.creatorId, name: a.creatorName });
    }
  }

  const day = (start: string) => ({ startDate: start, endDate: addDays(start, 1) });
  const events: TimelineEvent[] = [];

  for (const a of input.assignments) {
    const kind = a.creatorType === "influencer" ? "post" : "deliverable";
    events.push({
      id: `assignment-${a.id}`,
      resourceId: a.creatorId,
      name: `${kind === "post" ? "Post" : "Deliverable"} · ${a.status}`,
      ...day(a.dueDate),
      eventColor: a.status === "held" ? "red" : kind === "post" ? "violet" : "orange",
      kind,
      draggable: a.status !== "paid",
      resizable: false,
    });
  }

  for (const inv of input.invoices) {
    events.push({
      id: `invoice-${inv.id}`,
      resourceId: "client",
      name: `${inv.kind === "deposit" ? "Deposit" : "Balance"} ${usd(inv.amountCents)} · ${inv.status}`,
      ...day(inv.dueDate),
      eventColor: "blue",
      kind: "invoice",
      draggable: false,
      resizable: false,
    });
  }

  const creatorOf = new Map(input.assignments.map((a) => [a.id, a.creatorId]));
  for (const p of input.payouts) {
    const [label, color] = PAYOUT_LABEL[p.status];
    events.push({
      id: `payout-${p.id}`,
      resourceId: creatorOf.get(p.assignmentId) ?? "client",
      name: `${label} ${usd(p.amountCents)}`,
      ...day(p.scheduledFor),
      eventColor: color,
      kind: "payout",
      draggable: false,
      resizable: false,
    });
  }

  return { resources, events };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Add the loader that reads the database**

Create `src/lib/load-timeline.ts`:
```ts
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { toTimeline } from "./events";

export async function loadTimeline(campaignId: string) {
  const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!campaign) return null;
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, campaign.clientId));

  const rows = await db
    .select({ a: schema.assignments, c: schema.creators })
    .from(schema.assignments)
    .innerJoin(schema.creators, eq(schema.creators.id, schema.assignments.creatorId))
    .where(eq(schema.assignments.campaignId, campaignId));

  const invoices = await db.select().from(schema.clientInvoices).where(eq(schema.clientInvoices.campaignId, campaignId));
  const ids = rows.map((r) => r.a.id);
  const payouts = ids.length ? await db.select().from(schema.payouts).where(inArray(schema.payouts.assignmentId, ids)) : [];

  return {
    campaign,
    ...toTimeline({
      client: { id: client.id, name: client.name },
      assignments: rows.map(({ a, c }) => ({
        id: a.id,
        creatorId: c.id,
        creatorName: c.name,
        creatorType: c.type,
        dueDate: a.dueDate,
        status: a.status,
        feeCents: a.feeCents,
      })),
      invoices,
      payouts,
    }),
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/events.ts src/lib/events.test.ts src/lib/load-timeline.ts
git commit -m "feat: map campaign rows to timeline resources and events"
```

---

### Task 6: Show the campaign in Bryntum Scheduler and Calendar

UI task, verified by eye in the browser. This is the riskiest install of the week, so read first, then install.

**Files:**
- Create: `src/app/page.tsx` (replace generator default)
- Create: `src/app/campaigns/[id]/team/page.tsx`
- Create: `src/app/campaigns/[id]/calendar/page.tsx`
- Create: `src/components/TeamScheduler.tsx`
- Create: `src/components/TeamSchedulerInner.tsx`
- Create: `src/components/CampaignCalendar.tsx`
- Create: `src/components/CampaignCalendarInner.tsx`

**Interfaces:**
- Consumes: `loadTimeline(campaignId)` from Task 5 → `{ campaign, resources, events }`.
- Produces: routes `/`, `/campaigns/[id]/team`, `/campaigns/[id]/calendar`.

- [ ] **Step 1: Read Bryntum's install notes before installing (15 min)**

In the Bryntum docs, read (1) the React quick start for Scheduler, (2) the page on **using multiple Bryntum products in one app** (often called "thin" packages). Decide:
- **Plan A:** their documented way to load Scheduler + Calendar together.
- **Plan B (fallback, used below):** keep each product on its **own route** and switch with a full page load (`<a href>`, not Next `<Link>`), so one page never loads both products.

The steps below use Plan B because it works without the combined setup. Switch to Plan A later if the docs make it easy.

- [ ] **Step 2: Install the trial packages**

From the hackathon's Bryntum page:
```bash
npm install @bryntum/scheduler@npm:@bryntum/scheduler-trial @bryntum/scheduler-react
npm install @bryntum/calendar@npm:@bryntum/calendar-trial @bryntum/calendar-react
```
If npm returns 401/404, follow the registry login steps from the Bryntum trial download page, then rerun. Write down what you had to do: it goes in the README later, because judges must install it too (PRD Q2).

- [ ] **Step 3: Team view (Scheduler)**

Create `src/components/TeamSchedulerInner.tsx`:
```tsx
"use client";
import { BryntumScheduler } from "@bryntum/scheduler-react";
import "@bryntum/scheduler/scheduler.stockholm.css";
import type { TimelineEvent, TimelineResource } from "@/lib/events";

export default function TeamSchedulerInner(props: {
  resources: TimelineResource[];
  events: TimelineEvent[];
  startDate: string;
  endDate: string;
}) {
  return (
    <div style={{ height: 520 }}>
      <BryntumScheduler
        resources={props.resources}
        events={props.events}
        startDate={props.startDate}
        endDate={props.endDate}
        viewPreset="dayAndWeek"
        rowHeight={56}
        barMargin={8}
        columns={[{ text: "Creator", field: "name", width: 220 }]}
      />
    </div>
  );
}
```

Create `src/components/TeamScheduler.tsx`:
```tsx
"use client";
import dynamic from "next/dynamic";

const TeamScheduler = dynamic(() => import("./TeamSchedulerInner"), { ssr: false, loading: () => <p>Loading timeline…</p> });
export default TeamScheduler;
```

Create `src/app/campaigns/[id]/team/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import TeamScheduler from "@/components/TeamScheduler";
import { loadTimeline } from "@/lib/load-timeline";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadTimeline(id);
  if (!data) notFound();
  return (
    <main className="mx-auto max-w-7xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{data.campaign.name}</h1>
      <nav className="flex gap-2 text-sm">
        <a className="rounded-md bg-zinc-100 px-3 py-1.5 font-medium" href={`/campaigns/${id}/team`}>Team</a>
        <a className="rounded-md px-3 py-1.5 text-zinc-600" href={`/campaigns/${id}/calendar`}>Calendar</a>
      </nav>
      <TeamScheduler resources={data.resources} events={data.events} startDate="2026-10-19" endDate="2026-11-02" />
    </main>
  );
}
```

- [ ] **Step 4: Calendar view**

Create `src/components/CampaignCalendarInner.tsx`:
```tsx
"use client";
import { BryntumCalendar } from "@bryntum/calendar-react";
import "@bryntum/calendar/calendar.stockholm.css";
import type { TimelineEvent, TimelineResource } from "@/lib/events";

export default function CampaignCalendarInner(props: { resources: TimelineResource[]; events: TimelineEvent[]; date: string }) {
  return (
    <div style={{ height: 720 }}>
      <BryntumCalendar date={new Date(`${props.date}T00:00:00`)} mode="month" resources={props.resources} events={props.events} />
    </div>
  );
}
```

Create `src/components/CampaignCalendar.tsx`:
```tsx
"use client";
import dynamic from "next/dynamic";

const CampaignCalendar = dynamic(() => import("./CampaignCalendarInner"), { ssr: false, loading: () => <p>Loading calendar…</p> });
export default CampaignCalendar;
```

Create `src/app/campaigns/[id]/calendar/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import CampaignCalendar from "@/components/CampaignCalendar";
import { loadTimeline } from "@/lib/load-timeline";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadTimeline(id);
  if (!data) notFound();
  return (
    <main className="mx-auto max-w-7xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{data.campaign.name}</h1>
      <nav className="flex gap-2 text-sm">
        <a className="rounded-md px-3 py-1.5 text-zinc-600" href={`/campaigns/${id}/team`}>Team</a>
        <a className="rounded-md bg-zinc-100 px-3 py-1.5 font-medium" href={`/campaigns/${id}/calendar`}>Calendar</a>
      </nav>
      <CampaignCalendar resources={data.resources} events={data.events} date="2026-10-27" />
    </main>
  );
}
```

- [ ] **Step 5: Home page listing campaigns**

Replace `src/app/page.tsx`:
```tsx
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const campaigns = await db.select().from(schema.campaigns);
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Campaigns</h1>
      <ul className="divide-y rounded-lg border">
        {campaigns.map((c) => (
          <li key={c.id}>
            <a className="block p-4 hover:bg-zinc-50" href={`/campaigns/${c.id}/team`}>
              {c.name}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Check it in the browser**

Run: `npm run dev`, open http://localhost:3000.

Expected:
- Home lists "Kopi Kita · Pagi Launch".
- Team: rows Kopi Kita Sdn Bhd, @aina.eats, @jasonlifts, @mira.travels, Daniel Lim; the deposit invoice is outside the Oct 19 start (fine for now); @jasonlifts has a yellow "Awaiting approval $1,200" on Oct 29; Daniel's deliverable is red.
- Calendar: October month view showing the same events.
- Switching tabs does a full page load and both views render without console errors.

If a Bryntum prop name is rejected (console warning about an unknown config), look it up in the Bryntum API docs for that component and adjust; the data shape from `toTimeline` stays the same.

- [ ] **Step 7: Run all checks and commit**

Run: `npm test && npm run build`
Expected: tests pass, build succeeds.

```bash
git add -A
git status   # .env must not be listed
git commit -m "feat: campaign Team (Scheduler) and Calendar views on seed data"
```

---

### Task 7: End-of-week checkpoint

- [ ] **Step 1: Update open questions** in `docs/prd.html`:
  - Q1: answered from Task 3.
  - Q2: what the Bryntum install needed (public npm vs registry login), and whether you asked on the PayPal Discord about trial expiry.
- [ ] **Step 2: Note anything that surprised you** (API errors, prop names you changed) in a short "Phase 1 notes" list at the bottom of this plan. The Phase 2 plan will be written from these notes.
- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: phase 1 checkpoint, update open questions"
```

---

## What comes next (each gets its own plan when you reach it)

| Phase | Dates | Covers |
|---|---|---|
| **2: Money flows** | Oct 19–25 | Client deposit invoice + PayPal webhook (R5, R6, R15); approval queue, scheduled payouts, Send now, edits (R16, R17, R25, R26); post checklist (R7–R9); freelancer invoice entry + match against contract, manual first (R10–R12); audit log (R21) |
| **3: AI + views + deploy** | Oct 26–Nov 1 | Contract and invoice autofill with Claude Haiku 5.5 (R1–R3, R11); eval set (Q7); colours, side panel, polling (R13, R14, R18); drag to reschedule (R19); deploy to Render with webhooks and daily cron |
| **4: Polish** | Nov 2–8 | Eval targets, edge cases, reset-demo button, README with judge setup steps, MIT licence; R24 / R20 / R22 if time |
| **Submit** | Nov 9–11 | Video (≤ 2:50), Devpost text, submit Nov 11 |
