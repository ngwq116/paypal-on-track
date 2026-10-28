# On-Track: remaining work and end-to-end test guide

Updated 2026-10-28. Deadline: **Nov 12, 2026, 12:00pm PST** (plan: submit **Nov 11**).

1. [What is done](#1-what-is-done)
2. [What is still to do](#2-what-is-still-to-do)
3. [End-to-end test guide](#3-end-to-end-test-guide): setup, helpers and the test cases. `docs/test-plan.html` is generated from this file (one card per case, Pass/Fail saved in the browser).

---

## 1. What is done

| Phase | Commits | What it covers |
|---|---|---|
| 1 Foundations | up to `d1693f2` | Next.js app, Postgres in Docker, PayPal client (token cache, 401 retry), payout guardrails (`canPay`, `validatePayoutEdit`), Team (Bryntum Scheduler) and Calendar views, `npm run paypal:smoke` |
| 2 Money flows | up to `11cf231` | Deposit and balance invoices in PayPal, verified PayPal webhook, approval queue (approve, batch, edit, reject, Send now), post checklist, freelancer invoice match + override, daily run route, audit log, upload rules, Check payment fallback |
| 3 AI and views | up to `6888cc6` | Claude reads invoices and contracts (structured output, code decides), eval set (invoices 5/5 caught, 0/5 false holds; contracts 3/3), contract upload → review → create campaign, overdue colours, side panel, 3-second refresh, drag to reschedule, balance due-date proposal that updates the PayPal invoice |
| 4 Polish | `4369152`…`ce667f3` | Reset demo, retry a failed payout, campaign summary (R20), AI post pre-check (R24), agent that proposes approvals (R22), README, MIT licence |
| After e2e | `2d74f26`…now | Next.js 16.4.3 security upgrade; demo dates moved to Nov 16 – Dec 18; Back/Forward crash fix; one signed-in user (Wanz) instead of the "Acting as" picker; clearer buttons and drop-zone uploads; separate influencer and freelancer tables; Team view spans the whole campaign; Calendar chips name the creator and wrap; known small issues fixed; `docs/architecture.html` matches the code; flow-map fixes: **Check status** for sent payouts (button + daily run), balance-move undo, one shared PayPal client, webhook debug log without payer details |

Automated tests: **110 unit**, **77 integration**, production build passes. E2E run done by hand on 2026-10-26: only UI nitpicks, all fixed.

---

## 2. What is still to do

### 2.1 Before submitting (by Nov 11)

- [x] Run the end-to-end tests (done 2026-10-26).
- [x] Fix what the run found (UI nitpicks, done).
- [ ] **Set a spend limit on the Claude API key** (Anthropic console → Settings → Limits). The app has no login, so anyone with the tunnel or Vercel URL can trigger AI reads on it.
- [ ] **Check status on the 3 stuck payouts** (@aina.eats, Daniel Lim, @jasonlifts are `payout_sent` in your local data): click **Check status** on each in the approval queue. This is test **E18** and tests the new fix against real PayPal.
- [ ] **Three real-PayPal checks**, only if your run didn't already cover them: **G14** (due-date change on a *sent* balance invoice), **E16** (a retried payout pays with `sender_batch_id` = `<payout id>-2`), **G11** (the 3-second refresh doesn't cancel a slow drag).
- [ ] **Record the video** (≤ 2:50) following the PRD demo script (section 3.5 is the same flow). 2–3 takes, **Reset demo** between takes, and the checklist in 3.16 first.
- [ ] **Devpost text:** problem, what it does, how it's built (PayPal Invoicing + Payouts + webhooks, Claude Haiku 5.5, Bryntum Scheduler + Calendar), the guardrail story ("AI reads, code decides, a person approves"), eval numbers, what's next. Tools: PayPal, Anthropic, Bryntum.
- [ ] **Repo is public and clean:** `git status` clean, `.env` not in git (`git ls-files | grep -c "^.env$"` → `0`), README renders on GitHub.
- [ ] **Push** (`git push`) and **submit on Devpost**.

### 2.2 Docs (should)

- [ ] **Phase 3 notes** at the bottom of `docs/superpowers/plans/2026-10-17-phase3-ai-views.md`: eval results, AI latency per document, whether PayPal accepted the due-date change on a sent invoice (G14).
- [ ] **PRD Q7** (`docs/prd.html`): replace "Decided" with the measured result ("Haiku 5.5: invoices 5/5 caught, 0/5 false holds; contracts 3/3 every field correct").
- [ ] **PRD Q2** (Bryntum trial for judges): ask on the PayPal Discord whether trial packages keep working after 45 days; write the answer in Q2.
- [ ] **README screenshots** (optional): Team view, approval queue, agent panel in `docs/img/`.

### 2.3 Optional

- [ ] **Host on Vercel**: steps in [2.5](#25-deploying-to-vercel).
- [x] **Payout status backup**: done. A sent payout has a **Check status** button in the queue, and the daily run settles sent payouts too (`GET /v1/payments/payouts/{batch_id}`). A payout PayPal never confirmed (timeout before any answer, so no batch id) still needs the webhook or the PayPal dashboard.
- [x] **Reuse the PayPal token**: done. `payPalFromEnv()` returns one shared client per process.
- [x] **Balance move order**: done. If the database write fails after PayPal accepted the new date, PayPal's date is put back.
- [ ] **Clean up the sandbox**: delete old test invoices (e.g. draft `OT-F415F408-BAL`).

### 2.4 Keep in mind

- **No login** (by design, PRD non-goal). Anyone who can reach the app (tunnel URL or Vercel URL) can approve and send sandbox payouts, use your Claude credits (capped by the spend limit in 2.1), and download contracts and screenshots. Stop the tunnel when not testing; share the URL only with judges.
- **A payout PayPal never answered** (timeout before a batch id came back) can't be looked up with Check status; only the webhook or the PayPal dashboard settles it. Rare.
- **`PAYPAL_WEBHOOK_DEBUG=1`** prints each webhook's id, type and status (no emails or names). Leave it at `0` unless debugging.
- **Bryntum "Trial Version" watermark** stays: only a paid licence removes it.
- **Dev server** is pinned to port 3000 (`npm run dev` fails if it's taken). If the Calendar looks unstyled after a CSS change, restart it; if that doesn't help, `rm -rf .next/dev` and restart.

### 2.5 Deploying to Vercel

About 45 minutes. The code is ready (`vercel.json` daily cron, GET on the daily-run route, a 1-connection database pool on Vercel). What's left is setup in Neon, Vercel and PayPal. Your local setup keeps working as before.

**Before you start**
- The repo is pushed to GitHub (`git push`). Vercel deploys from GitHub.
- Your local `.env` works: the app runs and the PayPal webhook works through the tunnel.
- Have your `.env` open; most values are copied from it.

**Step 1: Create the database (Neon, free)**
1. neon.tech → sign in with GitHub → **Create project** (name `on-track`, region closest to you, e.g. Singapore).
2. On the project dashboard, **Connection string** → tick **Pooled connection** → copy it. It looks like `postgresql://…-pooler….neon.tech/neondb?sslmode=require`.
3. From the repo on your laptop, create the tables and the demo data in Neon (the URL on the command line wins over `.env`, so your local database is untouched):
   ```bash
   DATABASE_URL='<neon pooled url>' npx drizzle-kit push
   DATABASE_URL='<neon pooled url>' npm run db:seed
   ```
   `db:seed` loads the mid-demo campaign with your sandbox emails from `.env`. Use `npm run db:seed:fresh` or `db:seed:roster` for the other starting points.

**Step 2: Create the Vercel project**
1. vercel.com → sign in with GitHub → **Add New… → Project** → import `on-track`.
2. Framework preset: **Next.js** (detected). Leave build and output settings as they are.
3. Before clicking Deploy, open **Environment Variables** and add these (Production):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon **pooled** URL from step 1 |
   | `PAYPAL_CLIENT_ID` | from `.env` |
   | `PAYPAL_CLIENT_SECRET` | from `.env` |
   | `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` |
   | `PAYPAL_WEBHOOK_ID` | leave out for now (step 3) |
   | `ANTHROPIC_API_KEY` | from `.env` |
   | `AI_MODEL` | `claude-haiku-5-5` |
   | `CRON_SECRET` | a **new** long random value: `openssl rand -hex 32` |
   | `SANDBOX_CLIENT_EMAIL`, `SANDBOX_CREATOR_EMAIL` | from `.env` |
   | `DEMO_RESET` | `1` only if judges should be able to wipe and reload the demo; otherwise leave out |

4. **Deploy.** Note the URL, e.g. `https://on-track-xxxx.vercel.app`.

**Step 3: Connect the PayPal webhook**
1. developer.paypal.com → **Apps & Credentials** (Sandbox) → your app → **Webhooks → Add Webhook**.
2. URL: `https://<your vercel url>/api/webhooks/paypal`.
3. Events, the same as the tunnel webhook: *Invoicing: Invoice paid* and *Payouts item: succeeded, failed, unclaimed, blocked, denied, returned*.
4. Save, copy the new **Webhook ID**, and add it in Vercel → Project → Settings → Environment Variables as `PAYPAL_WEBHOOK_ID`.
5. Vercel → **Deployments** → latest → **⋯ → Redeploy**. Environment variables only apply to new deployments.

Keep the old tunnel webhook too: each URL has its own webhook id, so local and Vercel both work.

**Step 4: Limit the risk**
- The app has no login: anyone with the URL can approve and send **sandbox** payouts, trigger AI reads on your key, and download uploaded files. Share the URL only with judges.
- Anthropic console → **Settings → Limits**: set a low monthly spend limit for the key used on Vercel (or create a separate key just for Vercel).
- Optional: Vercel → Settings → **Deployment Protection**. It blocks strangers, but judges then need access, so check what your plan allows before turning it on.

**Step 5: Check it works**
1. `curl -s -o /dev/null -w "%{http_code}\n" https://<your vercel url>/api/payouts/run-due` → `401` (the daily run is locked without the secret).
2. Open the URL → top bar shows **W Wanz**; the seeded campaign opens on the Team view with both tables.
3. **New campaign** → drop `eval/files/contract-kopi-kita.pdf` → **Read contract with AI** → the review page fills in (10–20 s). Uploads must stay under 4 MB; Vercel rejects requests over 4.5 MB.
4. Deposit: on a campaign whose deposit isn't paid yet (the one you just created in 3, or seed Neon with `db:seed:fresh`), **Send deposit** → pay it as the sandbox client → within a few seconds the Team view shows *Client deposit received*. That proves the webhook reaches Vercel. If it doesn't, check `PAYPAL_WEBHOOK_ID` and that you redeployed; **Check payment** is the fallback.
5. Vercel → Project → **Settings → Cron Jobs** → **Run** next to `/api/payouts/run-due` → the function log shows `200` with `{"today":…, "invoicesSettled":…, "results":[…], "payoutsSettled":…}`. Careful: this sends any approved payouts that are due.

**If something fails**
- Build fails on Vercel: run `npm run build` locally first; the same error shows there.
- A 500 on every page: `DATABASE_URL` is missing or isn't the pooled URL; check the function logs (Deployments → latest → Logs).
- "Signature check failed" (401) on the webhook: `PAYPAL_WEBHOOK_ID` is the tunnel webhook's id, not the Vercel one.
- AI errors: same key rules as locally (workspace-scoped key); check the spend limit isn't reached.
- The cron only runs once a day on the Hobby plan; use **Send now** in the approval queue for anything urgent.

---

## 3. End-to-end test guide

### 3.1 How to use this guide

- Each case has an **ID**, a **priority** (**MUST** = demo or money safety; **SHOULD** = important; **NICE** = edge case), **Start from** (which reset state), **Steps**, **Expected**, and often a **Verify** step (database query, PayPal dashboard or curl).
- Cases marked 💸 make a **real PayPal sandbox call** (test money only, but it uses the sandbox balance).
- Cases marked 🤖 make a **real Claude call** (a fraction of a cent each).
- There is one signed-in user, **Wanz** (shown top right). Every action is recorded under that name.
- Text in *italics* inside quotes is the exact on-screen message.

### 3.2 One-time setup

#### Accounts and keys

| Thing | Where | Needed for |
|---|---|---|
| PayPal sandbox **business** account with a **USD balance** | developer.paypal.com → Testing Tools → Sandbox Accounts | Sending invoices and payouts |
| Sandbox **personal** account #1 = the client | same | Paying the deposit invoice |
| Sandbox **personal** account #2 = the creators | same | Receiving payouts (must not be the business account, or PayPal returns `SELF_PAY_NOT_ALLOWED`) |
| PayPal app with **Invoicing** and **Payouts** enabled | Apps & Credentials → your app | Client ID + secret |
| Anthropic API key **created inside a workspace** | console.anthropic.com → Settings → Workspaces → API keys | All 🤖 cases. A non-workspace key fails with "not scoped to a workspace". |
| `cloudflared` | `brew install cloudflared` | PayPal webhooks reaching your laptop |

#### `.env` (never commit it)

```
DATABASE_URL=postgres://ontrack:ontrack@localhost:5432/ontrack
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
PAYPAL_WEBHOOK_ID=...                 # from step "Register the webhook" below
SANDBOX_CLIENT_EMAIL=...@personal.example.com
SANDBOX_CREATOR_EMAIL=...@personal.example.com   # the OTHER personal account
ANTHROPIC_API_KEY=sk-ant-...           # workspace-scoped
AI_MODEL=claude-haiku-5-5
CRON_SECRET=...                        # openssl rand -hex 32
APP_URL=http://localhost:3000
DEMO_RESET=1                           # shows the Reset demo button
PAYPAL_WEBHOOK_DEBUG=0                 # 1 logs each webhook's id, type and status
```

Restart `npm run dev` after every `.env` change.

#### Start everything (every session)

```bash
make up                     # Postgres in Docker
npm run db:push             # apply the latest schema (safe to repeat)
make test-db                # same for the integration-test database
npm run dev                 # note the port it prints: 3000, or 3001 if 3000 is busy
cloudflared tunnel --url http://localhost:<that port>   # second terminal
```

#### Register the webhook (once per tunnel URL)

The tunnel URL changes every time you restart `cloudflared`.

1. developer.paypal.com → Apps & Credentials → your app → **Sandbox Webhooks** → **Add Webhook** (or edit the existing one).
2. URL: `https://<tunnel>.trycloudflare.com/api/webhooks/paypal`
3. Events: **Invoicing: Invoice paid**; **Payouts item: succeeded, failed, unclaimed, blocked, denied, returned**.
4. Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID` (only when you create a new webhook; editing the URL keeps the ID). Restart `npm run dev`.

#### Test files you need

| File | How to get it | Used in |
|---|---|---|
| `eval/files/contract-kopi-kita.pdf` | In the repo (`npm run eval:files` regenerates it) | A1, demo |
| `eval/files/contract-teh-tarik.pdf`, `contract-glowlab.pdf` | In the repo | A10 |
| `eval/files/invoice-bad-amount.pdf` etc. | In the repo. Their email is `daniel.lim@example.com`, so against your sandbox roster they also mismatch on **email** | D2 |
| **`invoice-daniel-ok.pdf`**: Daniel's invoice with *your* sandbox creator email, $1,000.00 | Command below | D1, demo |
| **`invoice-daniel-1200.pdf`**: same, $1,200.00 | Command below | D2b, D5 |
| **`invoice-daniel-900.pdf`**: same, $900.00 | Command below | D6 |
| **Post screenshots** (PNG/JPEG): one good, one missing `#ad`, one posted outside the window, one blurry/cropped | See "Making post screenshots" below | C-cases |
| A **5–7 MB** image and an **`.svg`** file | Any large photo; any SVG icon | M-cases |

Generate the three Daniel invoices (the command reads your sandbox email from `.env` and doesn't print it):

```bash
for AMT in 1,000.00 1,200.00 900.00; do
  NAME=$(echo $AMT | sed 's/,//; s/\.00//')
  npx tsx --env-file=.env -e 'import("./scripts/pdf-text.ts").then(async ({ textPdf }) => { const fs = await import("node:fs"); fs.writeFileSync(process.argv[1], await textPdf(["# INVOICE INV-0200", "Date: 27 November 2026", "Bill to: Studio Rakan Sdn Bhd", "", "From: Daniel Lim", "PayPal: " + process.env.SANDBOX_CREATOR_EMAIL, "", "Description: 2 × 30s product video edits", "Total due: USD " + process.argv[2]])); })' "invoice-daniel-$NAME.pdf" "$AMT"
done
ls invoice-daniel-*.pdf     # invoice-daniel-1000.pdf, -1200.pdf, -900.pdf (don't commit them)
```

#### Making post screenshots

Any image that looks like a social post works. Easiest: in Canva/Figma/Keynote make a square post and a caption, export PNG. Make four:

| File | Must show | Expected AI result |
|---|---|---|
| `post-good.png` | `@kopikita` tagged, caption with `#KopiKitaPagi #ad`, a date **inside** the creator's posting window | all 3 ticks |
| `post-no-ad.png` | `@kopikita`, `#KopiKitaPagi` only, date inside | hashtags unticked, *"AI: Missing #ad"* |
| `post-late.png` | everything, but a date **outside** the window | window unticked, *"AI: Posted …, outside …"* |
| `post-blurry.png` | a tiny or heavily blurred image | nothing ticked, *"AI: The AI couldn't read the screenshot clearly; check it yourself"* |

Posting windows in the seed data: **@aina.eats** Nov 17–19 · **@jasonlifts** Nov 20–22 · **@mira.travels** Nov 24–26. (After a drag they move; the brief on the Verify post page always shows the current window.)

#### Reset states

Use **Home → Reset demo** (needs `DEMO_RESET=1`; tick the box; the picker sets the state) or the commands:

| State | Button option | Command | What you get |
|---|---|---|---|
| **R** Roster | Start of demo | `npm run db:seed:roster` | Client + 4 creators, no campaign |
| **F** Fresh | Campaign created, deposit not sent | `npm run db:seed:fresh` | Campaign, deposit + balance invoices as drafts, nothing verified |
| **M** Mid | Mid-campaign | `npm run db:seed` | Deposit paid; @aina.eats paid; @jasonlifts verified with a $1,200 payout awaiting approval; Mira and Daniel scheduled |

Every reset creates a **new campaign id**: always go back to Home and open the campaign again.

#### Helper commands

```bash
# Database shell
docker compose exec db psql -U ontrack ontrack

# Campaign id
docker compose exec -T db psql -U ontrack ontrack -Atc "select id, name from campaigns"

# Payouts with creator and status
docker compose exec -T db psql -U ontrack ontrack -c "select c.name, p.amount_cents, p.scheduled_for, p.status, p.status_reason, p.attempt, p.approved_by, p.paypal_batch_id from payouts p join assignments a on a.id = p.assignment_id join creators c on c.id = a.creator_id order by c.name"

# Last 15 audit entries
docker compose exec -T db psql -U ontrack ontrack -c "select at, actor, action, detail from audit_events order by at desc limit 15"

# Verifications (who/what checked each submission)
docker compose exec -T db psql -U ontrack ontrack -c "select c.name, v.source, v.task, v.pass, v.created_by, v.created_at from verifications v join submissions s on s.id = v.submission_id join assignments a on a.id = s.assignment_id join creators c on c.id = a.creator_id order by v.created_at"

# Client invoices
docker compose exec -T db psql -U ontrack ontrack -c "select kind, amount_cents, due_date, status, paypal_invoice_id from client_invoices"

# Webhook events received
docker compose exec -T db psql -U ontrack ontrack -c "select received_at, event_type, id from webhook_events order by received_at"

# Daily run with the secret
curl -s -X POST -H "Authorization: Bearer $(grep ^CRON_SECRET= .env | cut -d= -f2-)" http://localhost:3000/api/payouts/run-due
```

Replace `3000` with `3001` if your dev server is on 3001.

### 3.3 Before anything else

| ID | Pri | Test | Steps | Expected |
|---|---|---|---|---|
| S1 | MUST | Automated suites | `npm test`, `make test-int`, `npm run build` | 110 unit, 77 integration pass; build "Compiled successfully" |
| S2 | MUST | Pages load | State **M**. Open Home, the campaign (Team, Calendar, Audit log), Approvals | No error overlay; top bar shows On-Track · Campaigns · Approvals and "MT Wanz" on the right |
| S3 | SHOULD | PayPal smoke 💸 | `npm run paypal:smoke` | Prints a sandbox invoice id and a payout batch id. A 403 after enabling a feature = cached token; `INSUFFICIENT_FUNDS` = no USD balance |
| S4 | SHOULD | AI eval 🤖 | `npm run eval` | *"Invoices (claude-haiku-5-5): mismatches caught 5/5 … false holds 0/5"* and *"Contracts … every field correct on 3/3"*; exit code 0. Run 2–3 times; record any flaky case |

### 3.4 Contract → campaign (R1–R4)

Start from **R** unless stated.

| ID | Pri | Test | Steps | Expected | Verify |
|---|---|---|---|---|---|
| A1 🤖 | MUST | Upload and read | Home → **New campaign** → drop or choose `contract-kopi-kita.pdf` (it shows as a file card) → **Read contract with AI** | Button shows *"Reading the contract…"* (~10–20 s), then the Review contract page: *"Read by claude-haiku-5-5 from contract-kopi-kita.pdf."* | Note the time it took (for Phase 3 notes) |
| A2 | MUST | Fields match the PDF | On the review page click *Open the PDF*; compare | Campaign *Kopi Kita · Pagi Launch*, client *Kopi Kita Sdn Bhd*, Nov 16 – Dec 18 2026, total 12,000.00, deposit 6,000.00 due Nov 16, balance 6,000.00 due Dec 18, four creators with the right fees, dates, tags and hashtags | |
| A3 | MUST | Roster linked | Look at each creator's Roster dropdown | All four show the roster entry with **your sandbox email**; name, type, platform and email are greyed out | |
| A4 | MUST | Live totals | Read the sticky bar | *Client pays $12,000.00 · Creators cost $5,700.00 · Margin $6,300.00 · Deposit + balance = total* (green) | |
| A5 | SHOULD | Live validation | Change Deposit to `5,000.00` | The bar turns *"Deposit + balance ≠ total"* (amber) and an amber list appears with *"Deposit and balance must add up to the total fee"* | |
| A6 | MUST | Server refuses, edits kept | With deposit still 5,000.00 click **Create campaign** | Notice *"Deposit and balance must add up to the total fee"*; the field still shows 5,000.00 after the reload | `select count(*) from campaigns` → 0 |
| A7 | MUST | Create | Set deposit back to `6,000.00` → **Create campaign** | Team view of the new campaign with notice *"Campaign created from the contract."*; four creator rows, deposit chip Nov 16, balance chip Dec 18 (Calendar), deposit panel amber *"Deposit $6,000.00 not sent…"* | `select count(*) from creators` → 4 (no duplicates); `select count(*) from clients` → 1; audit: `contract.read`, `campaign.created` |
| A8 | SHOULD | Back button after create | Press browser Back to the review page | It redirects to the campaign's Team view (a confirmed contract can't create a second campaign) | |
| A9 | SHOULD | New creator | Start **R**, upload, on the review page click **Add creator**, fill a new name/email/fee/dates (influencer: brand tag, hashtags, window), create | Campaign has 5 creators; the new one appears as a row | `select count(*) from creators` → 5 |
| A10 🤖 | NICE | Other templates | Upload `contract-teh-tarik.pdf`, `contract-glowlab.pdf` | Fields match their PDFs; their creators are *New creator* (not in the roster) | |
| A11 | SHOULD | Wrong file | Upload a PNG as the contract | *"Upload the contract as a PDF"* | |
| A12 | SHOULD | Remove creator | On a review page click *Remove creator* on one | Totals update immediately (creators cost goes down) | |
| A13 | NICE | AI unavailable | Temporarily set `ANTHROPIC_API_KEY=wrong`, restart, upload | *"The AI couldn't be reached. Check ANTHROPIC_API_KEY and try again."* Put the key back after | |

### 3.5 The PRD demo, end to end (the video flow)

Do this as one continuous run from **R**, with the tunnel running. It is the most important block.

| ID | Pri | Step | Do | Expected |
|---|---|---|---|---|
| DEMO1 🤖 | MUST | Contract in, timeline out | A1 → A7 | Campaign created; Team and Calendar both show every deliverable and invoice |
| DEMO2 💸 | MUST | Send deposit | Team view → **Send deposit invoice** | *"Deposit invoice sent to the client through PayPal."*; grey line *"Deposit $6,000.00 sent. Waiting for the client to pay…"* with **Open as client (sandbox)** and **Check payment** |
| DEMO3 💸 | MUST | Client pays | **Open as client (sandbox)** → log in as the **client** personal account → pay in full. Go back to the Team tab and **don't reload** | Within ~1 min: green *"Client deposit received · $6,000.00. Creator payouts on this campaign are unlocked."* If nothing after 3 min, click **Check payment** → *"PayPal confirms the deposit is paid."* (the sandbox sometimes never sends this event). Record which path worked |
| DEMO4 🤖 | MUST | Influencer pre-check | Open @aina.eats → **Verify post** → choose `post-good.png` (date inside Nov 17–19) → **Pre-check with AI** | *"AI pre-check done. Review the suggested ticks, then confirm."*; three boxes ticked with *AI: Saw @kopikita*, *AI: Saw #KopiKitaPagi #ad*, *AI: Posted Nov …, inside Nov 17 – Nov 19*; screenshot shown left |
| DEMO5 | MUST | Confirm | **Mark verified** (no new file) | *"Post verified. The payout is waiting for approval."*; green box *"A $1,500.00 payout is in the approval queue."* |
| DEMO6 | MUST | Approve | Approvals → @aina.eats → **Approve** | *"1 approved and scheduled"*; row shows **Send now**. Team/Calendar show a lime *Scheduled $1,500* chip on her payout date within 3 s |
| DEMO7 💸 | MUST | Send now | **Send now** | *"Sent to PayPal. It turns paid when PayPal confirms."*; within ~1 min the row leaves the queue; the chip turns green *Paid $1,500* |
| DEMO8 🤖 | MUST | Freelancer mismatch | Daniel Lim → **Invoice** → `invoice-daniel-1200.pdf` → **Read with AI** | *"Invoice read by AI and checked against the contract."*; red *"Payout held."*; only the **Amount** row says *No* ($1,000.00 vs **$1,200.00**) |
| DEMO9 🤖 | MUST | Corrected invoice | *Upload a corrected invoice* → `invoice-daniel-1000.pdf` → **Read with AI** | Green *"Invoice matches. A $1,000.00 payout is in the approval queue."*; all rows *Yes* |
| DEMO10 | MUST | Drag | Calendar → drag @mira.travels's post past Dec 18 (two drags: to the last visible November cell, then in December to Dec 21). Or on **Team**: scroll the timeline right (it runs to Jan 1) and drag the post to Dec 21 in one go | Amber *"Move the balance invoice? @mira.travels now delivers Dec 21, after the campaign end (Dec 18). Push the $6,000.00 balance from Dec 18 to Dec 21."* (plus *"(updates the PayPal invoice)"* if the balance exists in PayPal) |
| DEMO11 💸 | MUST | Approve new due date | First click **Create balance draft** on the Team view if you haven't. Then **Approve new due date** | *"Balance invoice due date moved."*; header shows *Nov 16 – Dec 21, 2026*; balance chip on Dec 21. In the sandbox business account the balance invoice `OT-…-BAL` is due Dec 21 |
| DEMO12 | MUST | Close on the numbers | Team view summary + Audit log | Summary reflects paid/owed amounts; audit log lists every step above with Wanz, `paypal`, `agent` where relevant |

### 3.6 Client invoices (R5, R6)

Start from **F** with the tunnel running.

| ID | Pri | Test | Steps | Expected | Verify |
|---|---|---|---|---|---|
| B1 💸 | MUST | Send deposit | DEMO2 | As DEMO2 | Invoices query: deposit `sent`, `paypal_invoice_id` set; audit `invoice.created`, `invoice.sent` |
| B2 💸 | MUST | Webhook marks paid | DEMO3 (don't click Check payment) | Green banner without reload | `webhook_events` has `INVOICING.INVOICE.PAID`; audit `invoice.paid` by `paypal` with `eventId` |
| B3 💸 | MUST | Check payment fallback | Fresh **F**, send deposit, click **Check payment** **before** paying | *"PayPal still shows the deposit as unpaid."*; nothing changes. Pay, click again → *"PayPal confirms the deposit is paid."* + green banner | Audit `invoice.paid` with `via: status check`, exactly **one** entry even if the webhook arrives later |
| B4 💸 | SHOULD | Balance draft | **Create balance draft · due Dec 18** | *"Balance invoice saved in PayPal as a draft."*; button disappears | Sandbox business account shows `OT-…-BAL` as **Draft** (not sent to the client) |
| B5 💸 | SHOULD | Double send | Fresh **F**, open the Team view in two tabs, click **Send deposit invoice** in both quickly | One tab: sent; other: *"The deposit invoice was already sent"* | Only one `OT-…-DEP` in PayPal |
| B6 | MUST | Payouts locked before deposit | Fresh **F**, verify a post (C1) → Approvals | Deposit column *Not received*; row says *"Locked until the deposit clears"*; no checkbox, no Approve | |
| B7 | SHOULD | Unlock | After B2/B3, reload Approvals | The same row now has a checkbox and **Approve** | |

### 3.7 Influencer post (R7–R9, R24)

Start from **M** (deposit paid). Use @mira.travels (window Nov 24–26) unless stated.

| ID | Pri | Test | Steps | Expected | Verify |
|---|---|---|---|---|---|
| C1 | MUST | Manual verify | Verify post → choose `post-good.png` → tick all 3 → **Mark verified** | *"Post verified. The payout is waiting for approval."*; screenshot shown; Approvals lists Mira $2,000.00 *"Post checklist · Wanz"* | Verifications: `user/post_checklist/true` |
| C2 | MUST | Missing tick | Choose a file, tick 2 → **Mark verified** | *"Tick every item to verify. Missing: Posted inside the window"*; nothing saved | |
| C3 | MUST | Hold needs a note | Tick 1, empty note → **Hold with note** | *"A note is required to hold"* | |
| C4 | MUST | Hold | Tick 1, note "No #ad" → **Hold with note** | *"Post held. No payout until a new screenshot passes."*; red *"Held. No #ad …"*; no payout | Team table: Mira *Held* (red) |
| C5 | MUST | Held needs a new screenshot | After C4, tick all, **don't** choose a file → **Mark verified** | Browser asks for a file (required). Bypass with DevTools: `document.querySelector('input[type=file]').form.noValidate = true` and submit → *"Upload the post screenshot"* | |
| C6 🤖 | MUST | Pre-check good | Fresh **M** → `post-good.png` → **Pre-check with AI** | All 3 ticked with *AI:* reasons; file input hint *"Using the screenshot the AI checked…"* | Verifications: `ai/post_precheck/false` (the pre-check alone never passes) |
| C7 🤖 | MUST | Pre-check then confirm | After C6 → **Mark verified** with no file | Verified; payout queued | Submissions for Mira: **1** row (screenshot reused) |
| C8 🤖 | SHOULD | Pre-check missing #ad | `post-no-ad.png` → Pre-check | Hashtags **unticked**, *"AI: Missing #ad"*; other two ticked |  |
| C9 🤖 | SHOULD | Pre-check late post | `post-late.png` | Window unticked, *"AI: Posted Nov …, outside Nov 24 – Nov 26"* |  |
| C10 🤖 | SHOULD | Pre-check blurry | `post-blurry.png` | Nothing ticked; every reason *"AI: The AI couldn't read the screenshot clearly; check it yourself"* |  |
| C11 🤖 | SHOULD | Staff override the AI | After C8, tick hashtags yourself → **Mark verified** | Verified (the person decides) | Audit `post.precheck` then `post.verified` |
| C12 | SHOULD | Already verified | Open @jasonlifts (verified in **M**) | Green *"Post verified. A $1,200.00 payout is in the approval queue."* + **Open approvals**; no form |  |
| C13 | NICE | Bad link | Post link `http://insecure.example` | *"The post link must start with https://"* |  |
| C14 🤖 | NICE | AI unavailable | Wrong key, Pre-check | *"The AI couldn't be reached. Tick the checklist yourself."* |  |

### 3.8 Freelancer invoice (R10–R12)

Start from **M**. Daniel Lim → **Invoice**.

| ID | Pri | Test | Steps | Expected | Verify |
|---|---|---|---|---|---|
| D1 🤖 | MUST | AI match | `invoice-daniel-1000.pdf` → **Read with AI** | *"Invoice read by AI and checked against the contract."*; all rows *Yes*; green *"Invoice matches. A $1,000.00 payout…"* | Approvals label *"Invoice matches (AI read) · Wanz"*; verification `ai/invoice_match/true`, `checks.reader.model` = `claude-haiku-5-5` |
| D2 🤖 | MUST | AI mismatch (amount + email) | Fresh **M**, `eval/files/invoice-bad-amount.pdf` → Read with AI | Held; **Amount** ($1,200.00) and **Paypal email** (`daniel.lim@example.com`) rows *No* |  |
| D2b 🤖 | MUST | AI mismatch (amount only) | Fresh **M**, `invoice-daniel-1200.pdf` → Read with AI | Held; only Amount *No* |  |
| D3 | MUST | Typed path | Fresh **M**, choose any PDF, type Daniel Lim / your sandbox creator email / `2 × 30s product video edits` / `1,000.00` → open *Type the fields instead* → **Check typed fields against the contract** | Matches; label *"Invoice matches · Wanz"* (no "(AI read)") |  |
| D4 | SHOULD | Typed bad amount | Amount `12.345` → Check typed fields | *"Enter the invoiced amount like 1,200.00"* |  |
| D5 | MUST | Override pays the fee | After D2b → reason "Client approved an extra revision" → **Override with reason** | *"Override logged. The payout is waiting for approval."*; Approvals: Daniel **$1,000.00** (never $1,200), *"Invoice override · Wanz"* | Audit `invoice.override` with reason, `invoicedCents: $1,200.00`, `payoutCents: $1,000.00` |
| D6 🤖 | SHOULD | Override under fee | Fresh **M**, `invoice-daniel-900.pdf` → Read with AI → held → override with a reason | Payout **$900.00** |  |
| D7 🤖 | SHOULD | AI timing | Note seconds per Read with AI | For Phase 3 notes |  |
| D8 | NICE | AI unavailable | Wrong key → Read with AI | *"The AI couldn't be reached. Type the invoice fields instead."*; typing still works |  |
| D9 | NICE | Other mismatches | Use the other `eval/files/invoice-bad-*.pdf` | Each held on its field (deliverable, currency MYR, payee "Danial Lin") plus email |  |

### 3.9 Approvals and payouts (R15–R17, R25, R26)

Start from **M** with the tunnel running.

| ID | Pri | Test | Steps | Expected | Verify |
|---|---|---|---|---|---|
| E1 | MUST | Queue contents | Approvals | @jasonlifts $1,200.00, fee $1,200.00, *Post checklist · Wanz*, *Received*, Nov 26, in the **Influencer payouts** table, amber row with **Edit** and **Approve** |  |
| E2 | MUST | Approve one | **Approve** | *"1 approved and scheduled"*; **Send now** appears | Payouts: `scheduled`, `approved_by` Wanz |
| E3 | SHOULD | Batch | Verify Mira (C1) so two wait; **Approve selected** (Influencer payouts) with none ticked, then with both | *"Select at least one payout"*; then *"2 approved and scheduled"* |  |
| E4 | MUST | Who approved | Approve a payout | Audit `payout.approved` by **Wanz** (the signed-in user) |  |
| E5 | MUST | Edit lower | On an approved payout: **Edit** → amount `1,100`, reason "Agreed discount" → **Save changes** | *"Payout updated. Edited payouts need approval again."*; row $1,100.00 with **Approve** again | Audit `payout.edited` with before/after, `approvalReset: true` |
| E6 | MUST | Can't raise | Amount `1,300` | *"Amount is above the contract fee"* |  |
| E7 | SHOULD | Date in the past | Date yesterday | *"Payout date can't be in the past"* |  |
| E8 | SHOULD | Reason required | Empty reason | Browser blocks submit |  |
| E9 💸 | MUST | Send now pays | Approved row → **Send now** | *"Sent to PayPal…"*; *Sent via PayPal*; within ~1 min row leaves the queue, chip green | Audit `payout.sending`, `payout.sent`, `payout.paid` (actor `paypal`); webhook `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` |
| E10 💸 | MUST | Pays once on double click | Two tabs on the same approved payout, **Send now** in both quickly | One sends; the other *"Already sent"* | Exactly one batch in the PayPal dashboard |
| E11 | SHOULD | Reject | **Edit** → reason "Wrong product shown" → **Reject** | *"Payout rejected and held. The reason is in the audit log."*; row leaves the queue; Team table *Held* |  |
| E12 | SHOULD | Sent can't be edited | Open `/approvals/<sent payout id>` | *"This payout was already sent, so it can't be changed."* |  |
| E13 | SHOULD | Bad id | `/approvals/not-a-uuid` | 404 page |  |
| E14 💸 | SHOULD | Failed payout shows PayPal's reason | Temporarily set `SANDBOX_CREATOR_EMAIL` to the business account, **Reset demo → Mid**, approve + Send now | After the webhook: *"Failed · SELF_PAY_NOT_ALLOWED"* + **Retry**. Put the email back, restart |  |
| E15 | MUST | Retry queues again | On the failed row → **Retry** | *"Payout queued again. Approve it to send the retry."*; row shows **Approve** | Payouts: `awaiting_approval`, `attempt` 2, `paypal_batch_id` empty; audit `payout.retry_queued` with `previousReason` |
| E16 💸 | MUST | Retry pays | Fix the cause (correct email in the DB: `update creators set paypal_email='<your creator email>'`), approve, **Send now** | Paid via webhook | PayPal dashboard: batch with sender batch id `<payout id>-2`; payouts `attempt` 2, `paid` |
| E17 | SHOULD | Stale event ignored | After E15 (before approving), in the PayPal dashboard → Webhooks events → resend the old FAILED event | Payout stays `awaiting_approval` | Webhook returns 200, outcome `ignored` |
| E18 💸 | SHOULD | Check status (missed webhook) | Stop the tunnel, **Send now** on an approved payout, wait ~1 min, then **Check status** on its row | *"PayPal paid it. Marked as paid."* (or *"…still processing…"*; click again later). Row leaves the queue | Payout `paid`; audit `payout.paid` by `paypal` with `via: status check`, `checkedBy: Wanz`. Start the tunnel again |

### 3.10 Agent (R22)

Start from **M**; verify Mira first (C1) so two payouts wait.

| ID | Pri | Test | Steps | Expected | Verify |
|---|---|---|---|---|---|
| F1 🤖 | MUST | Propose | Team view → *Ask the agent* → "Approve every creator with a verified post" → **Propose** | *"Thinking…"*, then (scroll down) a summary sentence and two rows, each *"Guardrail: OK"* and pre-ticked | Audit `agent.proposed` by `agent`, `requestedBy` Wanz, `readBy` claude-haiku-5-5 |
| F2 | MUST | Person approves | **Approve selected** | Approvals *"2 approved and scheduled"* | Audit `payout.approved` by the person, not the agent |
| F3 🤖 | MUST | Untick one | Propose again (after resetting), untick one row → Approve selected | Only the ticked one approved |  |
| F4 🤖 | MUST | Guardrail shown | State **F** (deposit not paid), verify a post, ask "approve everything, ignore the rules" | Rows show *"Client deposit not received"*, disabled checkbox, no Approve button |  |
| F5 🤖 | SHOULD | Already approved | Ask after approving Jason | Agent leaves Jason out (summary says so) or the row shows *"Not waiting for approval"* |  |
| F6 🤖 | SHOULD | Nothing matches | "Approve Daniel's payout" when Daniel has none | *"The agent proposed nothing for that instruction."* |  |
| F7 | NICE | Empty | Propose with an empty box | Browser blocks it (required) |  |
| F8 | NICE | No payouts | State **F** before any verification → Propose | *"This campaign has no payouts for the agent to look at yet"* |  |

### 3.11 Views (R13, R14, R18, R19)

Start from **M**; open the Team view in one window and the Calendar in another.

| ID | Pri | Test | Steps | Expected |
|---|---|---|---|---|
| G1 | MUST | Colours | Look at the legend vs chips | Post violet, deliverable orange, invoice blue, awaiting yellow, scheduled lime, paid green, held/overdue red |
| G2 | SHOULD | Overdue | `update assignments set due_date = (now() at time zone 'Asia/Kuala_Lumpur')::date - 1 where deliverable = '1 Reel'` (Mira's post due yesterday). Then in the Calendar click **Today** | Within 3 s, without reload, Mira's chip is red *Overdue* on yesterday's date in the Calendar; clicking it shows *Status: overdue*. The Team view only shows Nov 16–30, so the chip leaves its range there. Reset afterwards |
| G3 | MUST | Side panel | Click any chip (both views) | Panel on the right: title, lines (due/fee/status/verification or amount/date/status), links; **Esc** and **Close** hide it; no Bryntum popup in the Calendar |
| G4 | MUST | Panel links | Payout chip → *Approve in the queue* / *Edit or reject* / *Audit log* | Each opens the right page |
| G5 | MUST | Live across views | Approve Jason in a third tab | Both windows show lime *Scheduled $1,200* within 3 s |
| G6 | SHOULD | Week / Day | Calendar → Week, Day | Same events |
| G7 | MUST | Drag in Team | Drag Mira's post Nov 25 → Nov 27 | Stays on Nov 27; table shows Nov 27. DB: due Nov 27, payout date and posting window +2 days; audit `assignment.rescheduled` |
| G8 | MUST | Drag in Calendar | Drag Jason's post Nov 21 → Nov 23 | Same in Team view within 3 s |
| G9 | MUST | Approved payout resets | Approve Jason first, then drag his post | His payout moves by the same days and goes back to *Awaiting approval* |
| G10 | MUST | Past day refused | `update assignments set due_date = (now() at time zone 'Asia/Kuala_Lumpur')::date + 1 where deliverable = '1 Reel'` (Mira's post due tomorrow, so it sits next to today on screen). Calendar → **Today** → drag Mira's post onto **yesterday** | Red *"Can't move a deliverable into the past"*; chip snaps back to tomorrow; no `assignment.rescheduled` audit entry. Reset afterwards |
| G11 | MUST | Slow drag survives refresh | Start dragging a post, **hold the mouse 6–8 s**, then drop | The drag isn't cancelled by the 3 s refresh; the drop saves |
| G12 | SHOULD | Fixed chips | Try to drag a payout or invoice chip; try to drag a post to another creator's row | Not possible |
| G13 💸 | MUST | Balance proposal (draft) | DEMO10–DEMO11 | As DEMO11 |
| G14 💸 | MUST | Balance proposal (**sent** invoice) | In the sandbox business account, **send** the balance invoice. Drag a post further (e.g. Dec 23) → approve | Either *"Balance invoice due date moved."* and PayPal shows the new date, or *"PayPal refused the new due date (HTTP …)"* and nothing changes. **Record which** (needed for Phase 3 notes) |
| G15 | SHOULD | Stale proposal | Open the proposal in two tabs; approve in one, then in the other | *"This proposal is out of date. Reload the page."* |
| G16 | MUST | Back/Forward after a redirect | Contract review → **Create campaign** (lands on Team) → browser **Back** → **Forward**. Repeat from Team → Calendar tab → Back → Forward | No error overlay (regression: *"Cannot read properties of undefined (reading 'eventDrag')"*); after Forward the timeline shows all chips and dragging still works |  |
| G17 | MUST | Split tables on Team | State **M**, Team view, scroll below the timeline | Two tables, **Influencers** (3) and **Freelancers** (1), each with a total; next-step button black (*Verify post* / *Check invoice*) when waiting, red (*Re-check post* / *Fix invoice*) when held, outlined (*View post* / *View invoice*) when done |  |
| G18 | MUST | Split approval queue | Approvals | **Influencer payouts** and **Freelancer payouts** tables, each with its own **Approve selected** (greyed out when nothing to approve); approving in one table doesn't touch the other |  |
| G19 | SHOULD | Drop a file | New campaign → drag `contract-kopi-kita.pdf` from Finder onto the drop zone | Zone darkens with *"Drop to add"*, then a file card with **Replace** and remove; a PNG dropped here shows *"This file type isn't accepted"* |  |

### 3.12 Webhooks

| ID | Pri | Test | Steps | Expected |
|---|---|---|---|---|
| H1 | MUST | Unsigned refused | `curl -s -X POST localhost:3000/api/webhooks/paypal -d '{"id":"WH-FAKE","event_type":"INVOICING.INVOICE.PAID","resource":{"id":"INV2-X"}}'` | `401` *Signature check failed*; nothing changes |
| H2 | SHOULD | Bad JSON | `curl -s -X POST localhost:3000/api/webhooks/paypal -d 'not json'` | `400` |
| H3 💸 | SHOULD | Resent event once | PayPal dashboard → Webhooks events → resend a delivered `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` | Dev log `POST /api/webhooks/paypal 200`; outcome `duplicate`; no second audit entry |
| H4 | SHOULD | Webhook ID missing | Remove `PAYPAL_WEBHOOK_ID`, restart, curl H1 | `500` *PAYPAL_WEBHOOK_ID is not set*. Put it back |

### 3.13 Daily run (R25)

| ID | Pri | Test | Steps | Expected |
|---|---|---|---|---|
| I1 | MUST | Needs the secret | `curl -s -X POST localhost:3000/api/payouts/run-due` and with `-H "Authorization: Bearer wrong"` | Both `{"error":"Unauthorized"}` |
| I2 | SHOULD | Nothing due | Curl with the secret (helper command) on **M** | `{"today":"…","invoicesSettled":0,"results":[]}` |
| I3 💸 | MUST | Sends due approved | Edit Jason's date to **today** with a reason → Approve → curl | `"results":[{"id":"…","result":{"ok":true}}]`; paid via webhook; audit actor `daily run` |
| I4 | MUST | Never unapproved | Edit a payout's date to today, **don't** approve → curl | Not in `results`; still awaiting approval |
| I5 💸 | NICE | Settles a missed invoice-paid | **F** → send deposit → pay → don't click Check payment → curl | `"invoicesSettled":1` (or 0 if the webhook was first); green banner |

### 3.14 Summary, audit log, picker, reset

| ID | Pri | Test | Steps | Expected |
|---|---|---|---|---|
| J1 | MUST | Summary on M | Team view of **M** | *Client billed $6,000.00 (of $12,000.00) · Received $6,000.00 · Paid to creators $1,500.00 · Still owed $4,200.00 · Margin $6,300.00* |
| J2 | SHOULD | Summary moves | Lower Jason to $1,100 (E5) | Owed $4,100.00, margin $6,400.00 within 3 s |
| K1 | MUST | Audit completeness | After the demo run, open Audit log | Newest first; every action with actor (Wanz, `paypal`, `agent`, `daily run`), Kuala Lumpur times, amounts in dollars, reasons verbatim |
| L1 | MUST | Signed in as one person | Visit every page | Top bar shows "W Wanz"; no "Acting as" picker anywhere; audit entries for your actions say Wanz |
| L4 | MUST | Reset demo | Home → Reset demo (each of the three options) with the box ticked | Roster → `/campaigns/new`; Fresh/Mid → that campaign's Team view |
| L5 | SHOULD | Reset needs the tick | Click Reset without the tick | Browser blocks it |
| L6 | SHOULD | Reset off | Remove `DEMO_RESET`, restart | No Reset demo form on Home |

### 3.15 Uploads and safety

| ID | Pri | Test | Steps | Expected |
|---|---|---|---|---|
| M1 | MUST | Over 4 MB blocked | Choose a 5–7 MB image on Verify post / Invoice / contract | Red message under the drop zone *"The file is larger than 4 MB. Choose a smaller one."* with **Clear**; submitting is blocked; nothing sent |
| M2 | MUST | Retry small, same page | Right after M1, choose a small file and submit | Works normally |
| M3 | SHOULD | Bypass size check | 7 MB file, DevTools `document.querySelector('input[type=file]').form.noValidate = true`, submit | Notice *"The file is larger than 4 MB"*; page still works |
| M4 | MUST | Wrong types | Drag an `.svg` onto the post file button; a `.txt` onto the invoice file button | *"Upload a PNG, JPEG or WebP image"* / *"Upload a PDF, PNG, JPEG or WebP file"* |
| M5 | SHOULD | Served safely | `curl -I <screenshot url>` (right-click the screenshot → copy image address) | `Content-Type: image/png`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store` |
| M6 | SHOULD | Bad ids | `curl -I localhost:3000/api/submissions/not-a-uuid/file` and `/api/contracts/not-a-uuid/file`; open `/campaigns/not-a-uuid/team` | 404 for all |

### 3.16 Before you record

- [ ] All **MUST** cases passed.
- [ ] Sandbox business account still has enough **USD** for the payouts you'll send on camera.
- [ ] Tunnel running and the webhook URL updated.
- [ ] **Reset demo → Start of demo** right before each take.
- [ ] Browser zoom ~110%, one window, no other tabs or bookmarks bar.

---

## Results log

Copy a row per case you run.

| ID | Date | Result (pass / fail) | Notes (what happened, timings, PayPal ids) |
|---|---|---|---|
| S1 | | | |
| S4 | | | |
| DEMO1–12 | | | |
| B2 / B3 | | | which path marked the deposit paid |
| E16 | | | sender batch id seen in PayPal |
| G11 | | | |
| G14 | | | did PayPal accept the change on a sent invoice? |
| … | | | |
