# On-Track

AI payment desk for marketing agencies: bill clients through PayPal, pay influencers and freelancers through PayPal Payouts once their work is verified and a person approves it. Entry for the PayPal AI Hackathon (deadline Nov 12, 2026, 12:00pm PST). Solo builder, about 8 hours a week.

## Where things are

- Product spec: `docs/prd.html` (requirements R1–R26, open questions)
- Technical design: `docs/architecture.html` (stack, data model, guardrails, PayPal endpoints)
- Market research: `docs/market-research.html`
- Current build plan: `docs/superpowers/plans/` (newest file is the active phase)
- UI prototype: https://claude.ai/artifact/MbwdtGAA4WLNMiYMzUpH4z (shadcn-style, zinc palette, Geist font)

## Commands

- `npm test`: Vitest, all unit tests
- `npm run dev`: app on http://localhost:3000
- `npm run build`: production build (run before every commit)
- `npm run db:push` / `npm run db:seed` / `npm run db:studio`: Drizzle against local Postgres in Docker (`make up`, database `ontrack`)
- `npm run paypal:smoke`: sends a real $1.00 sandbox invoice and payout

## Rules that must not break

- **Money is integer cents** everywhere (`feeCents`, `amountCents`). Convert to a PayPal string only with `toPayPalValue()` in `src/lib/paypal/money.ts`.
- **Calendar dates are `YYYY-MM-DD` strings**, compared as strings. Never turn a payout date into a `Date` (timezone shifts; the agency is in UTC+8).
- **USD only.** PayPal **sandbox** only (`https://api-m.sandbox.paypal.com`).
- **No payout leaves without `canPay()` returning `allow`** (`src/lib/domain/guardrails.ts`). It must be called at approval and again right before `createPayout()`. Never call `createPayout()` from anywhere else.
- **Every payout needs a person's approval.** There is no auto-approve. The AI or agent may only propose; it never sends money.
- A payout amount can never exceed the assignment's contract fee. Edits go through `validatePayoutEdit()`: lower amount or move date only, reason required, editing a scheduled payout resets approval.
- PayPal `sender_batch_id` and `sender_item_id` = our payout row id (idempotency: a retry must not pay twice).
- The PayPal MCP server / Agent Toolkit has **no Payouts tools**. Payouts go through our REST client in `src/lib/paypal/payouts.ts`.
- **Never commit `.env`** or print secrets. The repo is public. Run `git status` before every commit.
- AI model: `claude-haiku-5-5` via `AI_MODEL` (fallback `claude-sonnet-5-5`). The AI reads documents; comparisons and decisions are plain code.

## How to work here

- Domain rules (`src/lib/domain/`) and PayPal helpers (`src/lib/paypal/`) are test-first: write the failing Vitest test, then the code.
- Keep files small and single-purpose. Follow the active plan's file paths and function names exactly; later tasks depend on them.
- UI follows the prototype: shadcn/ui components, zinc greys, thin borders, no gradients or emoji.
- One task = one commit. Commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `test:`.
- When a PayPal call fails, use `/paypal:explain-error <code>` before guessing.
