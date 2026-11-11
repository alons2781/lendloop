# LendLoop

## Application

LendLoop is a neighborhood tool-lending app. Users list tools they own, other users request to borrow them for a date range, and both sides get email notifications for each step, plus a daily reminder when a loan is overdue.

The signed-out home page shows the tools that are currently available (name and category only) and the sign-in / sign-up buttons.

**Create your user.** Click "Create an account" (or "Sign up" in the header) and complete the Clerk form with a username, email and password. The first time you land on the dashboard, the app creates your profile row in Convex. There is no seed data and no separate registration step.

**List an item.**

1. Open "My listings" and click "+ List a tool".
2. Enter a name, pick a category and a condition (Like new / Good / Works with limits), and optionally a description.
3. Save. The tool now appears in "Browse tools" for every signed-in user and on the public page.

**Borrow an item.**

1. Open "Browse tools" (optionally filter by category) and click "Request to borrow" on a tool that is not yours.
2. Pick the From and To dates and send the request. The owner gets an email.
3. Follow the request under "Current lends & borrows". The owner approves or declines it.
4. When you are done, click "Return tool". The owner then clicks "Confirm return", which closes the loan.

Finished, declined and cancelled loans are under "History".

## Architecture

| Part | Technology | Role |
|---|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 | One route per section (see below). `src/proxy.ts` runs Clerk's `clerkMiddleware`. |
| Backend | Convex | Database, queries, mutations, scheduled actions and HTTP actions (`convex/`). All access control is enforced here. |
| Authentication | Clerk | Sign-up, sign-in and the JWT that Convex verifies on every call. The user's role comes from a claim in that JWT. |
| Notifications | n8n (self-hosted, Docker) | Sends the emails. Runs behind a Caddy gate; Mailpit is the local SMTP inbox. |

Routes (`src/app`): `/` is the public landing page and sends signed-in users to `/browse`. The signed-in routes live in the `(app)` group, which shares one layout (`src/components/app-shell.tsx`) that waits for auth, redirects signed-out visitors to `/`, and shows the greeting and section links:

| Route | Section | Who |
|---|---|---|
| `/browse` | Browse tools | users and admins |
| `/listings` | My listings | users |
| `/loans` | Current lends & borrows | users |
| `/history` | History | users |
| `/admin` | Admin | admins |

Opening a route your role doesn't have redirects to `/browse`. This only decides what is rendered; the Convex functions still enforce every permission.

```
 Browser ── sign-in ──► Clerk
    │
    │ queries / mutations with the Clerk JWT
    ▼
 Convex ◄─────────────────────────────────────────────┐
    │                                                 │
    │ (1) loan event                                  │ (2) overdue reminders
    │     POST /webhook/lendloop/loan-event           │     POST /n8n/overdue-loans
    │     signed with N8N_WEBHOOK_SECRET / _TOKEN     │     POST /n8n/reminders
    ▼                                                 │     signed with N8N_API_SECRET / _TOKEN
 Caddy gate (:8080)                                   │
    │ forwards only that POST, only with the token    │
    ▼                                                 │
   n8n ───────────────────────────────────────────────┘
    │
    ▼
  SMTP (Mailpit locally)
```

The browser never contacts n8n. It talks to Clerk and Convex only; every n8n call is made server-side by Convex, or by n8n calling Convex.

Two signed directions, each with its own secret and token:

- **Convex -> n8n (loan events).** Each loan mutation schedules the internal action `notify.sendLoanEvent`, which runs after the mutation commits. It builds a minimal payload, signs it and POSTs it to the n8n webhook. n8n verifies it, drops duplicates, sends the email and records the delivery.
- **n8n -> Convex (overdue reminders).** A daily n8n schedule (9am in `GENERIC_TIMEZONE`) sends a signed request to the Convex HTTP action `/n8n/overdue-loans`, emails each borrower, and writes each result (`sent`, `failed`, `skipped`) back to `/n8n/reminders`.

Both directions use the same scheme: `X-LendLoop-Token`, `X-LendLoop-Timestamp` (unix seconds) and `X-LendLoop-Signature: sha256=<hex>`, where the signature is HMAC-SHA256 over `<timestamp>.<raw body>`.

Emails per event:

| Event | Recipient |
|---|---|
| Request created | Owner |
| Approved / declined | Borrower |
| Request cancelled | Owner |
| Borrower marks returned | Owner |
| Return confirmed | Borrower |
| Overdue (daily) | Borrower |

A third workflow, `error-handler.json`, is the error workflow of the other two and emails `LENDLOOP_ALERT_EMAIL` when a run fails.

## Functions

### User

- Sign up, sign in and sign out through Clerk.
- Browse all tools, with a category filter. Each card shows the condition, description, lender name and a "Trusted Lender" badge if the lender has one. Availability is shown as a state (you requested it, you have it, on loan with someone else) without naming the other borrower. A pending request from someone else does not make a tool unavailable.
- List a tool: name (max 80 characters), category (one of the fixed list), condition, optional description (max 200). Up to 50 listings per user.
- Edit a listing. Blocked while the tool is borrowed or has a pending request.
- Delete a listing. Blocked while the tool is borrowed. Pending requests on it are declined and the borrowers are notified.
- Request to borrow someone else's tool for a date range. Dates must be real calendar dates. The start date cannot be in the past and the end date cannot be before the start. Several people can have a pending request on the same tool, but you cannot request one you already asked for, and a tool that is out on loan (approved or return pending) cannot be requested.
- Cancel your own request while it is pending.
- Approve or decline requests on your tools. Approving one request declines the other pending requests on that tool, and those borrowers are notified.
- Mark a tool you borrowed as returned ("Return tool").
- Confirm the return of your tool ("Confirm return"). This closes the loan and deletes the listing; list the tool again to lend it again. The loan keeps a copy of the tool name for history.
- See "Current lends & borrows" and "History", each split into Borrowing and Lending. History shows 4 entries and a "Show more" button.
- See an overdue badge and "N days overdue" on approved loans past their end date, and "Reminder sent N days ago" once a reminder is at least a day old.
- See a counter on "Current lends & borrows" for requests and returns waiting on you as the owner.

### Admin

An admin is a Clerk user whose public metadata contains `{ "role": "admin" }`. Admins get two sections, "Browse tools" and "Admin".

- See all loans in the system (the latest 500, any status) with tool, borrower, dates and status.
- See the users who have signed in (admins excluded) and mark or unmark each one as a Trusted Lender.
- Remove any listing from "Browse tools", unless it is currently borrowed. Pending requests on it are declined and the borrowers are notified.

Admins cannot list tools or request to borrow (the server rejects both), cannot edit other users' listings, and never carry the Trusted Lender badge. Promote only fresh accounts: an account that already has listings or loans loses the sections needed to act on them.

## Current security measures and optimizations

### Access control and business rules (Convex)

- Every query and mutation calls `requireUser` or `requireAdmin`, except `tools.listPublic`, which is public and returns only name and category.
- The role is read from the `role` claim of the verified Clerk JWT. Only the exact string `admin` grants admin rights. The `role` column in the `users` table is a copy used for display rules, not for authorization. Convex accepts only tokens with audience `convex` from the configured Clerk issuer.
- Ownership is checked on the stored row: only the owner approves, declines and confirms a return; only the borrower cancels a request or marks a tool returned.
- A return takes two steps. The borrower marks it returned, and the tool stays locked until the owner confirms.
- Rate limit: a borrower can create at most 10 requests per hour (`MAX_REQUESTS_PER_HOUR` in `convex/loans.ts`). This also bounds the notification emails one account can trigger.
- A tool is out with at most one borrower at a time, enforced in the mutation: approval is rejected if another loan is already approved or awaiting return confirmation, and approving a request declines the other pending ones. Convex mutations are serializable transactions, so two concurrent approvals cannot both succeed.
- Listings cannot be edited while requested or borrowed, and cannot be deleted while borrowed.
- Text inputs are trimmed and length-limited on the server (name 80, description 200). Control characters are removed from names and categories (so they cannot add line breaks to email subjects) and from descriptions, which keep their newlines.
- Category must be one of the fixed list in `convex/lib/categories.ts`, which the UI uses too. A listing created before the list existed can keep its old category when edited.
- At most 50 listings per user, checked in `tools.create`.
- Dates are checked as real calendar dates, so `2026-02-31` is rejected. There is no upper bound on start date or duration (see the limitations below).
- Queries do not return Clerk user ids to other users. `tools.listAll` returns `mine: true/false` instead of the owner id, and loan queries return an explicit set of fields (tool name, borrower name, dates, status). The admin list of lenders is keyed by the Convex row id.
- Errors shown to the user are only `ConvexError` messages; anything else becomes a generic message.

### Webhooks and HTTP endpoints

- Shared token header, compared in constant time by n8n and by Convex.
- Timestamp window of 5 minutes either way, to limit replay.
- HMAC-SHA256 signature over the timestamp and the raw body, compared in constant time.
- Idempotency. Loan events carry the key `<loanId>:<event>`; n8n records it only after the email is sent, so a retry does not send twice and a failed send can be retried. Reminder write-backs use `<loanId>:<date>`; a `sent` row is never overwritten, and a `failed` row can be upgraded on a retry.
- Separate secret and token per direction, so a leak in one direction does not open the other.
- Generic errors. Every authentication failure returns `401 {"error":"unauthorized"}`, from n8n and from Convex, without saying which check failed.
- Convex retries a failed delivery up to 4 attempts, with backoff of 30 s, 2 min and 10 min, then logs an error. n8n failures trigger the error workflow.
- Secrets live only in environment variables (`n8n/.env`, Convex environment). The workflow JSON reads them through `$env` and contains none.
- Clerk to Convex: `POST /clerk/webhook` verifies the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`, 5-minute window) with `CLERK_WEBHOOK_SECRET`. On `user.deleted` it removes the user's profile row and listings, declines pending requests on those listings and cancels the user's own pending requests. Loan records stay for history, and a tool that is currently out on loan is left in place.

### Network and n8n

- The Caddy gate forwards only `POST /webhook/lendloop/loan-event` carrying the correct `X-LendLoop-Token`, with the body capped at 64 KB. Everything else gets a 404: the editor, the REST API, test webhooks, other paths and methods, and requests with a missing or wrong token. Unauthenticated traffic does not start an n8n execution. Caddy's admin API is off.
- n8n, the gate and the Mailpit inbox are published on `127.0.0.1` only. Mailpit's SMTP port is not published at all.
- Execution retention: successful executions are not saved (they contain recipient emails); failed ones are kept for 7 days.
- `N8N_CONCURRENCY_PRODUCTION_LIMIT=1` makes n8n run one production execution at a time and queue the rest. The dedupe list is workflow static data, which can lose a write when two executions overlap; running them one by one avoids that.

### Data minimization

- The public page gets tool name and category only.
- Webhook payloads contain the tool name, dates, status, the recipient's username and email, and the other party's username. No Clerk ids, descriptions or third-party emails.
- The overdue endpoint returns only the fields the reminder email uses.
- Emails are stored for notifications only and are never returned to the UI.

### Optimizations

- Notifications are scheduled (`scheduler.runAfter(0, ...)`), so a mutation does not wait on n8n, and nothing is sent if the mutation fails.
- Lookups use indexes (`by_owner`, `by_borrower`, `by_tool`, `by_status`, `by_category`, `by_clerkId`, `by_key`, `by_loan`).
- List queries are bounded: 100 tools on the public page, 200 in Browse, 500 loans in the admin view.
- The n8n dedupe store drops keys older than 7 days.

### Known limitations / still open

Security:

- No upper bound on the start date or the duration of a loan, so a request can be for any date in the future and any length. A possible fix is a maximum lead time (for example 1 year) and a maximum duration (for example 90 days) in `loans.request`; whether it is worth adding depends on the requirements.
- The n8n dedupe store is workflow static data. The concurrency limit in the compose file serializes executions, which should prevent the lost-write race, but this has not been tested under concurrent load, and the limit does not apply on n8n Cloud or if you change it. A proper fix is to claim the delivery key in Convex before sending (a `deliveries` table plus an endpoint on the n8n channel), where mutations are serializable.
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` makes every environment variable, including the encryption key, readable from any workflow. Accepted for a single-owner instance; revisit when the workflows move to n8n credentials.
- The gate has no rate limiting, and its token check is a plain header match used as a pre-filter. The signature check in n8n is the actual control. The gate runs the official `caddy:2.8-alpine` image, which does not include a rate-limit module; use the limits of the tunnel or load balancer in front of it, or build a custom Caddy image with a rate-limit plugin.
- Account cleanup depends on the Clerk `user.deleted` webhook (see Configuration). If the webhook is not set up, a deleted Clerk account stays in Convex; clean it up by hand with `bunx convex run users:removeByClerkId '{"clerkId":"user_..."}'`, which removes only the profile row.

Behavior:

- A loan can stay `approved` indefinitely. Only the borrower can mark it returned; until then neither the owner nor an admin can close it, edit the tool or delete it.
- A request whose end date has already passed can still be approved, and is overdue immediately.
- "Today" is UTC everywhere (date picker minimum, overdue calculation), so it runs a day ahead for evening users in the Americas.
- If a reminder email is sent but the write-back to Convex fails, nothing is recorded and the next run sends that reminder again.

Scale:

- Queries are unbounded or capped with `take(...)` and have no pagination, and some run one lookup per row (loans per tool, reminders per loan). That is fine at demo scale; at real volume they would need pagination and denormalized availability.

Other:

- There is no automated test suite. Verification is manual plus `n8n/scripts/test-webhook.sh`.
- Local n8n needs a public HTTPS address for Convex to reach it; a quick tunnel changes address on every restart.

## Configuration

### Prerequisites

- [bun](https://bun.sh)
- Docker with Docker Compose (for n8n, Caddy and Mailpit)
- A [Clerk](https://clerk.com) account and a [Convex](https://convex.dev) account
- `openssl` and `curl` (secrets and the test script)
- A tunnel client such as `cloudflared`, to let Convex reach a local n8n

### 1. Install

```bash
bun install
cp .env.example .env.local
```

### 2. Clerk

1. Create a Clerk application. Enable username, email address and password as sign-up fields. The app relies on the username and email claims, and the sign-in widget hides social buttons.
2. Copy the publishable key and the secret key into `.env.local`:

   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

3. Create a JWT template named `convex` in the Clerk dashboard with these claims:

   ```json
   {
     "aud": "convex",
     "role": "{{user.public_metadata.role}}",
     "username": "{{user.username}}",
     "email": "{{user.primary_email_address}}"
   }
   ```

   The Convex client uses this template unless the default session token already has `"aud": "convex"`. Adding the same four claims under Sessions -> Customize session token works as well.
4. Note the Frontend API URL of the Clerk application (the issuer). It is needed in the next step.
5. To make an admin, open the user in the Clerk dashboard and set public metadata to `{ "role": "admin" }`. The role reaches Convex with the next token Clerk issues; signing out and in forces it.

### 3. Convex

```bash
bunx convex dev
```

On the first run this logs you in, creates the project and writes the Convex values (`CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`) into `.env.local`. Leave it running; it pushes backend changes as you save.

Set the Clerk issuer:

```bash
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-clerk-frontend-api>
```

Optional but recommended, so deleted Clerk accounts are cleaned up in Convex:

1. In the Clerk dashboard, go to Webhooks and add an endpoint at `https://<deployment>.convex.site/clerk/webhook`, subscribed to the `user.deleted` event only. This is a public Convex URL, so it needs no tunnel.
2. Copy the endpoint's signing secret (`whsec_...`) and set it:

```bash
bunx convex env set CLERK_WEBHOOK_SECRET whsec_...
```

If your Clerk plan does not include webhooks, skip this. Deleted accounts then stay in Convex until you remove them by hand (see the limitations above).

### 4. Run the app

```bash
bun dev
```

Open http://localhost:3000. The app works without n8n: if the `N8N_*` variables are not set in Convex, loan events only log a `[notify] ... not sent` warning in the Convex logs, and no email is sent.

### 5. Secrets

Generate five values, one per line of this list:

```bash
openssl rand -hex 32
```

- `N8N_ENCRYPTION_KEY`: n8n's own key for stored credentials.
- Two secrets: the HMAC keys that sign requests, one per direction.
- Two tokens: sent as the `X-LendLoop-Token` header, one per direction. A token is a cheap pre-filter (the Caddy gate drops requests without it); the signature is what authenticates the request.

Each secret and token is set on both sides with the same value:

| Convex variable | `n8n/.env` variable | Direction | Purpose |
|---|---|---|---|
| `N8N_WEBHOOK_URL` | (none) | Convex -> n8n | Public URL of the gate plus `/webhook/lendloop/loan-event` |
| `N8N_WEBHOOK_SECRET` | `LENDLOOP_WEBHOOK_SECRET` | Convex -> n8n | HMAC key for loan events |
| `N8N_WEBHOOK_TOKEN` | `LENDLOOP_WEBHOOK_TOKEN` | Convex -> n8n | Token header, also checked by the gate |
| `N8N_API_SECRET` | `LENDLOOP_API_SECRET` | n8n -> Convex | HMAC key for the overdue endpoints |
| `N8N_API_TOKEN` | `LENDLOOP_API_TOKEN` | n8n -> Convex | Token header for the overdue endpoints |
| (none) | `LENDLOOP_CONVEX_SITE_URL` | n8n -> Convex | The deployment's `.convex.site` URL (`NEXT_PUBLIC_CONVEX_SITE_URL` in `.env.local`) |

### 6. n8n environment

```bash
cd n8n
cp .env.example .env
```

Fill in `n8n/.env`:

| Variable | Value |
|---|---|
| `N8N_ENCRYPTION_KEY` | Generated value |
| `GENERIC_TIMEZONE` | Timezone for n8n and the 9am schedule |
| `LENDLOOP_WEBHOOK_SECRET`, `LENDLOOP_WEBHOOK_TOKEN` | Generated values (Convex -> n8n) |
| `LENDLOOP_API_SECRET`, `LENDLOOP_API_TOKEN` | Generated values (n8n -> Convex) |
| `LENDLOOP_CONVEX_SITE_URL` | `https://<deployment>.convex.site`, no trailing slash |
| `LENDLOOP_APP_URL` | App URL used for links in emails (default `http://localhost:3000`) |
| `LENDLOOP_MAIL_FROM` | From address of the emails |
| `LENDLOOP_ALERT_EMAIL` | Recipient of workflow failure alerts |
| `N8N_PUBLIC_URL` | Public URL of n8n; n8n uses it as its `WEBHOOK_URL` |

Compose refuses to start if the encryption key, the two secrets, the two tokens or the Convex site URL are missing. Both `.env.local` and `n8n/.env` are git-ignored.

### 7. Docker Compose

```bash
docker compose up -d      # from n8n/
```

| Service | Image | Host port | Notes |
|---|---|---|---|
| `n8n` | `n8nio/n8n:2.47.3` | `127.0.0.1:5678` | Editor and webhooks. Create the owner account on first visit. |
| `gate` | `caddy:2.8-alpine` | `127.0.0.1:8080` | The only service meant to be reachable from the internet. |
| `mailpit` | `axllent/mailpit:v1.21` | `127.0.0.1:8025` | Web inbox. SMTP is `mailpit:1025` inside the compose network only. |

Volumes: `n8n_data` (n8n's database and settings), `./workflows` mounted read-only at `/workflows`, `./credentials` read-only at `/credentials`, and `./Caddyfile` read-only into the gate.

The compose file also sets `NODE_FUNCTION_ALLOW_BUILTIN=crypto` and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, because the Code nodes compute HMACs and read the secrets from `$env`, the execution retention settings described above, and `N8N_CONCURRENCY_PRODUCTION_LIMIT=1`, which makes webhook-triggered executions run one at a time (the rest queue). A webhook call can therefore wait while an earlier execution finishes.

### 8. Mailpit and the workflows

Mailpit catches every email and delivers nothing. The inbox is at http://localhost:8025.

Import the SMTP credential (host `mailpit`, port 1025, no user or password) and the three workflows, then activate the two that have triggers:

```bash
docker compose exec n8n n8n import:credentials --input=/credentials/smtp-mailpit.json
docker compose exec n8n n8n import:workflow --input=/workflows/error-handler.json
docker compose exec n8n n8n import:workflow --input=/workflows/loan-notification.json
docker compose exec n8n n8n import:workflow --input=/workflows/overdue-reminders.json
docker compose exec n8n n8n publish:workflow --id=lendloopLoanNotif01
docker compose exec n8n n8n publish:workflow --id=lendloopOverdue0001
docker compose restart n8n
```

The workflows are exported inactive. They can also be imported and activated from the n8n editor; the email nodes expect a credential named `LendLoop SMTP`.

| Workflow | What it does |
|---|---|
| `loan-notification.json` | Webhook -> verify token, timestamp and signature -> reject, or skip a duplicate -> build the email -> send -> record the delivery -> respond. |
| `overdue-reminders.json` | Daily 9am or manual trigger -> signed request for overdue loans -> one email per borrower -> signed write-back per loan. |
| `error-handler.json` | Emails an alert when either workflow fails. |

### 9. Caddy gate

`n8n/Caddyfile` listens on `:8080` and has one allowed route. A request is proxied to `n8n:5678` only if all three match:

- method `POST`
- path `/webhook/lendloop/loan-event`
- header `X-LendLoop-Token` equal to `LENDLOOP_WEBHOOK_TOKEN`

The body is capped at 64 KB. Anything else gets `404 Not found`.

The reason is that n8n serves its editor, REST API and every webhook on one port. Exposing the gate instead of n8n keeps all of that private, and the token match stops unauthenticated requests before they start an execution. n8n still checks the token and the signature itself.

### 10. Tunnel and Convex variables

Convex runs in the cloud and cannot reach `localhost`. Expose the gate, port 8080, not n8n on 5678:

```bash
cloudflared tunnel --url http://localhost:8080
```

Use the printed address in `N8N_WEBHOOK_URL` and set the same secrets as in `n8n/.env`:

```bash
bunx convex env set N8N_WEBHOOK_URL    https://<tunnel-host>/webhook/lendloop/loan-event
bunx convex env set N8N_WEBHOOK_SECRET <LENDLOOP_WEBHOOK_SECRET>
bunx convex env set N8N_WEBHOOK_TOKEN  <LENDLOOP_WEBHOOK_TOKEN>
bunx convex env set N8N_API_SECRET     <LENDLOOP_API_SECRET>
bunx convex env set N8N_API_TOKEN      <LENDLOOP_API_TOKEN>
```

A quick tunnel gets a new address on every restart; update `N8N_WEBHOOK_URL` each time. The n8n -> Convex direction needs no tunnel, because n8n calls the public `.convex.site` URL.

### 11. Test script

`n8n/scripts/test-webhook.sh` reads the secret and token from `n8n/.env` and sends a signed event with `curl`. The loan notification workflow must be active.

```bash
cd n8n
./scripts/test-webhook.sh                 # valid event -> 200, email in Mailpit
./scripts/test-webhook.sh --replay        # same delivery twice -> second is a duplicate
./scripts/test-webhook.sh --tamper        # body changed after signing -> 401
./scripts/test-webhook.sh --stale         # timestamp 1 h old -> 401
./scripts/test-webhook.sh --bad-token     # wrong token -> 401
./scripts/test-webhook.sh --event loan.returned --email me@example.com
```

By default it posts straight to n8n on port 5678. To go through the gate:

```bash
WEBHOOK_URL=http://localhost:8080/webhook/lendloop/loan-event ./scripts/test-webhook.sh
```

Through the gate, `--bad-token` returns 404 instead of 401.

To test reminders, create an approved loan whose end date has passed and run the overdue workflow from the editor with its manual trigger.

### 12. Deployment notes

- **Convex production:** `bunx convex deploy`, then set `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SECRET` (with a webhook endpoint pointing at the production `.convex.site` URL) and the five `N8N_*` variables on the production deployment. Environment variables are per deployment.
- **Vercel:** import the repository, set the Clerk keys and the production `NEXT_PUBLIC_CONVEX_URL`, and add the Vercel domain in Clerk.
- **Clerk:** a development instance (`pk_test_` / `sk_test_` keys) is not meant for real users. Production needs a production instance and its own issuer URL in Convex.
- **n8n on a VM:** run `n8n/docker-compose.yml`, put HTTPS in front of the gate only, and keep port 5678 private. Point `N8N_WEBHOOK_URL` at the public gate URL and set `LENDLOOP_APP_URL` to the app's URL. Move n8n from SQLite to Postgres and back up the `n8n_data` volume if the data matters.
- **Real SMTP:** create the credential in the n8n editor under the name `LendLoop SMTP` and do not commit it. Set up SPF and DKIM for the sending domain.
- **Secrets:** generate new ones for production; do not reuse the local values.
- **n8n Cloud:** there is no Caddy gate, so the webhook URL is public and the in-workflow token and signature checks are the only protection. The Code nodes depend on `$env` and `require('crypto')`, which this setup enables through self-hosted environment settings; check what n8n Cloud allows in Code nodes and move the secrets to credentials or adapt the nodes before importing.
