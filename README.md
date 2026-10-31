# On-Track

An AI payment desk for marketing agencies. Bill the client through PayPal, pay influencers when their post is verified and freelancers when their invoice matches the contract, all on one shared timeline and calendar. Built for the PayPal AI Hackathon 2026.

**The rule that makes it safe:** the AI reads documents and proposes; plain code decides; a person approves every payout. No payout leaves before the client's deposit has cleared, and none can exceed the contract.

## What it does

- **Contract in, timeline out:** upload a signed contract PDF; Claude extracts the terms; you review every field; the campaign, creators and invoices are created.
- **Client billing:** send the deposit invoice through PayPal in one click; the PayPal webhook marks it paid and unlocks creator payouts.
- **Influencers:** upload the post screenshot, let the AI pre-check the brief, confirm the checklist; the payout goes to the approval queue.
- **Freelancers:** Claude reads the invoice; code compares it with the contract; mismatches are held with both values shown.
- **Approvals and payouts:** approve one by one, in a batch, or from an agent's proposal; payouts go out through PayPal Payouts on their date or with Send now.
- **Views:** Bryntum Scheduler (team) and Calendar, live-updating, drag to reschedule; an audit log of every step.

## Run it locally

You need Node 24+, Docker, a PayPal developer account and an Anthropic API key.

1. **PayPal sandbox** (developer.paypal.com):
   - A sandbox **business** account with a **USD** balance (it sends payouts and invoices), and two sandbox **personal** accounts: one is the client, one is the creator.
   - An app under Apps & Credentials with **Invoicing** and **Payouts** enabled. If you enable a feature after creating the app, wait for (or revoke) the cached access token.
2. **Anthropic:** an API key created inside a **workspace** (console.anthropic.com → Settings → Workspaces → API keys).
3. **Configure:**
   ```bash
   cp .env.example .env   # fill in the values; never commit .env
   npm install
   make up                # Postgres in Docker
   npm run db:push
   npm run db:seed:roster # client + creators; the demo starts by uploading the contract
   npm run dev            # http://localhost:3000
   ```
4. **Webhooks** (deposit paid, payout paid): run `cloudflared tunnel --url http://localhost:3000`, then in your PayPal app add a sandbox webhook to `https://<tunnel>/api/webhooks/paypal` with *Invoicing: Invoice paid* and *Payouts item: succeeded, failed, unclaimed, blocked, denied, returned*. Put its id in `PAYPAL_WEBHOOK_ID` and restart.
   The app also works without the tunnel: **Check payment** on the deposit panel asks PayPal whether the client has paid, and **Check status** on a sent payout in the approval queue asks PayPal whether it was paid. The daily run (`POST /api/payouts/run-due` with `Authorization: Bearer <CRON_SECRET>`) does both for everything outstanding.

## Demo in six steps

1. Home → **New campaign** → drop `eval/files/contract-kopi-kita.pdf` → **Read contract with AI** → review → **Create campaign**.
2. Team view → **Send deposit invoice** → **Open as client (sandbox)** → pay as the client account → the banner turns green (or click **Check payment**).
3. An influencer's **Verify post** → drop a screenshot → **Pre-check with AI** → **Mark verified** → Approvals → **Approve** → **Send now**.
4. Daniel Lim → **Check invoice** → drop `eval/files/invoice-bad-amount.pdf` → **Read invoice with AI** → held (its amount, and its example email, differ from the contract); then an invoice with the right amount and the creator's sandbox email → matches.
5. Calendar → drag a post past the campaign end → approve the proposed balance due date (updates the PayPal invoice).
6. **Audit log** and the campaign summary.

Set `DEMO_RESET=1` to get a **Reset demo** button on the home page.

## Commands

| Command | What |
|---|---|
| `npm test` | Unit tests |
| `make test-int` | Integration tests against a test database |
| `npm run eval:files && npm run eval` | AI accuracy on the eval set (needs `ANTHROPIC_API_KEY`) |
| `npm run paypal:smoke` | Sends a real $1.00 sandbox invoice and payout |
| `npm run build` | Production build |

## Stack

Next.js 16 · React 19 · TypeScript · Drizzle + PostgreSQL · Bryntum Scheduler & Calendar · Tailwind + shadcn/ui · PayPal REST (Invoicing v2, Payouts v1, Webhooks) · Claude Haiku 5.5 (structured outputs). Docs: `docs/prd.html`, `docs/architecture.html`, `docs/test-plan.html`.

## Licence

MIT. See `LICENSE`.
