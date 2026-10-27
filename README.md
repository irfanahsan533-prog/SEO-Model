# SEO Model

SEO Model is an evidence-first SEO application for website owners. It runs real website audits, reads Google
Search Console performance through OAuth, records competitor observations with provenance, supports keyword research
from measured and clearly labelled sources, and monitors sites daily with confirmed, de-duplicated alerts.

**Non-negotiable rule:** SEO Model never fabricates search volume, keyword difficulty, rankings, traffic, backlinks,
clicks, impressions or fix outcomes. Measured values show their source and timestamp. AI output is labelled as a
hypothesis or draft. Unavailable data is shown as unavailable or "connection required".

---

## 1. Feature checklist

Status legend: **Implemented** (code complete and covered by the build/tests), **Partial** (works with stated limits),
**Blocked** (needs an external account, key or deployment that this environment cannot provide).

| Area | Status | Notes |
| --- | --- | --- |
| Sign up / sign in / sign out | Implemented | Scrypt password hashes, DB-backed sessions (SHA-256 token hashes), httpOnly cookies, failed-sign-in throttling. Custom credentials auth instead of Auth.js (see §8). |
| Protected routes and tenant isolation | Implemented | Every project API and page calls `requireProjectAccess`; non-members get 404. Covered by DB integration tests. |
| Account and project deletion | Implemented | Password-confirmed account deletion; owner-only project deletion with Google grant revocation. |
| Website URL validation (SSRF) | Implemented | http/https only, default ports only, no credentials, DNS and IP policy, redirect revalidation, DNS-rebinding guard at connect time. |
| Website audit crawler | Implemented | Queue in PostgreSQL (`crawl_jobs`, `crawled_pages`), bounded batches, `FOR UPDATE SKIP LOCKED` claims, retries, robots.txt, sitemaps, per-project delay, page limit (default 100, max 500). |
| On-page and technical rules | Implemented | Status, redirects and loops, titles/descriptions (missing, length, duplicate), H1s, heading order, canonicals, noindex (meta and header), links, broken links, images (missing alt, broken via HEAD), mixed content, hreflang, JSON-LD parse errors, sitemap consistency, thin content (labelled as heuristic), body duplicates, URL variants, depth and orphan candidates. |
| Issue lifecycle | Implemented | Resolve / ignore / reopen; "verify now" re-fetch for page-level rules; automatic verified-fixed or still-present on re-audit; per-run observation history. |
| Health score | Implemented | SEO Model internal score (formula documented in `src/lib/audit/analyze.ts`), not a Google metric. |
| Fix proposals and approvals | Partial | Draft values and approval states are stored. No CMS integration exists, so nothing is ever applied to a website (`executionStatus = not_connected`). |
| PageSpeed Insights | Implemented (needs key) | Lab score, metrics, opportunities and CrUX field data when Google has it. Blocked until `PAGESPEED_API_KEY` is set. |
| Google Search Console OAuth | Implemented (needs Google client) | PKCE, signed state cookie, encrypted refresh tokens, revocation, `needs_reauth` handling. Blocked until a Google OAuth client exists and its redirect URI is registered. |
| Search Console reporting | Implemented (needs connection) | Stored 90-day daily snapshots (date, device, country) for charts; live queries for top queries, pages, countries, devices, query/page pairs, two-range comparison, opportunity and cannibalization candidates. |
| Competitor discovery | Partial | Needs a licensed SERP provider (`SERP_API_KEY`, SerpApi adapter) or a user-sourced CSV. Without either, the UI shows "connection required". Classifications are analytical judgments and labelled as such. |
| Keyword research | Implemented | Sources: Search Console (measured), user input, CSV (user-provided volume labelled), SERP suggestions (labelled), page titles. Rule-based intent, clusters, page mapping, cannibalization and gap candidates. "Search volume unavailable" when no source provides volume. Optional AI intent classification. |
| Monitoring & alerts | Implemented (daily) | Homepage and monitored URLs (availability, redirect target, noindex, canonical, title, meta description), robots.txt (blocking and hash changes), sitemap (availability, removed URLs). Retries, change confirmation, incident de-duplication, cooldowns, email (Resend) and signed webhooks, delivery logs. |
| Scheduled monitoring | Blocked until deployed | `vercel.json` schedules `/api/cron/monitoring` daily at 06:00 UTC. It is active only after deployment with `CRON_SECRET` set. |
| AI analysis | Implemented (optional) | Issue prioritization, keyword intent classification and title/description drafts. Schema-validated output, unknown IDs dropped, daily per-user limit. Blocked until `AI_PROVIDER_API_KEY` is set. |
| CSV exports | Implemented | Issues, pages, keywords, competitors, incidents, Search Console daily data. Formula-injection protection. |
| Dark and light themes, responsive layout | Implemented | Sidebar, mobile menu, keyboard focus styles, skip link. |
| Unit and integration tests | Implemented | 108 tests (SSRF, redirects, robots, sitemaps, parsing, rules, duplicates, OAuth state, credential handling, cron auth contract, migrations and tenant isolation against a test database). |
| End-to-end tests | Written, not executed here | `e2e/core-workflows.spec.ts` requires Playwright browsers (`npx playwright install chromium`). |
| Production deployment on Vercel | Blocked | Requires your Vercel account, a Neon (or other Postgres) database and environment variables. See §6. |

---

## 2. Architecture

- **Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS 4.** Route handlers under `src/app/api`,
  server components for pages, client components only for interactive views (`src/components`).
- **PostgreSQL + Drizzle ORM.** Schema: `src/db/schema.ts`. Versioned SQL migrations: `drizzle/`.
- **Server-only modules** (`src/lib`): crypto, OAuth, Google API, SSRF-safe HTTP client, crawler engine,
  monitoring, AI. Browser bundles never import them (`server-only` guard on page-level helpers).
- **Crawler:** `src/lib/audit/engine.ts` stores the queue in the database. Each request (or cron tick) processes one
  bounded batch of pages, so nothing crawls an unlimited site in one invocation. Progress is polled from
  `/api/projects/[id]/audits/[auditId]`. Batches are idempotent and resumable.
- **Monitoring:** `src/lib/monitoring.ts`. Observations are append-only (`monitoring_observations`). Incidents are
  keyed by a fingerprint with at most one open incident per fingerprint.
- **Outbound HTTP:** `src/lib/safe-http.ts` uses `node:http(s)` with a custom `lookup` that revalidates every resolved
  address, follows redirects manually, enforces timeouts and size limits, and never follows redirects into a
  disallowed destination.
- **Errors and logging:** unexpected errors return a reference ID; internal details are logged without request bodies,
  tokens or secrets.

### Database tables

`users`, `sessions`, `projects`, `project_members`, `integrations`, `encrypted_credentials`, `crawl_jobs`,
`crawled_pages`, `audit_runs`, `audit_issues`, `audit_issue_observations`, `pagespeed_results`,
`search_console_sync_runs`, `search_console_daily_metrics`, `competitors`, `competitor_observations`,
`keyword_records`, `keyword_observations`, `monitoring_settings`, `monitoring_rules`, `monitoring_runs`,
`monitoring_observations`, `incidents`, `notification_deliveries`, `usage_events`, `audit_logs`.

---

## 3. Local development

Prerequisites: Node.js 20.18.1 or newer (22 recommended), PostgreSQL 14+ (local or Neon).

```bash
npm install
cp .env.example .env            # then edit values (never commit .env)
npm run db:migrate              # applies drizzle/ migrations to DATABASE_URL
npm run dev                     # http://localhost:3000
```

Generate a session secret with `openssl rand -base64 48` and put it in `AUTH_SECRET` (32+ characters).
`AUTH_SECRET` also derives the key that encrypts stored Google tokens and signs OAuth state. Changing it invalidates
sessions and stored credentials.

### Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (type checks included) |
| `npm run start` | Production server (after build) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js rules) |
| `npm run test` | Vitest unit and integration tests |
| `TEST_DATABASE_URL=... npm run test` | Also runs the database tenant-isolation tests (creates and deletes its own rows) |
| `npm run test:e2e` | Playwright end-to-end tests (needs `npx playwright install chromium`) |
| `npm run db:generate` | Generate a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |

---

## 4. Environment variables

Only variables used by implemented features are listed. Every optional integration reports its missing variable
names in the UI. Values are never displayed.

| Variable | Required | Purpose | Where to get it |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection | Neon: project → Connection string (pooled, `sslmode=require`) |
| `AUTH_SECRET` | Yes | Session/encryption/signing secret (32+ chars) | `openssl rand -base64 48` |
| `APP_URL` | Recommended | Public base URL, used for redirects and links | Your deployment URL |
| `GOOGLE_CLIENT_ID` | For Search Console | OAuth client | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application) |
| `GOOGLE_CLIENT_SECRET` | For Search Console | OAuth client secret | Same as above |
| `GOOGLE_REDIRECT_URI` | For Search Console | Must exactly match a registered redirect URI | `https://<domain>/api/integrations/google/callback` (and `http://localhost:3000/...` for local) |
| `PAGESPEED_API_KEY` | For PageSpeed | PageSpeed Insights API key | Google Cloud → enable "PageSpeed Insights API" → create API key (restrict it to this API) |
| `CRON_SECRET` | For scheduled monitoring | Bearer token for `/api/cron/monitoring` | `openssl rand -hex 32`; Vercel sends it automatically when set as an environment variable |
| `AI_PROVIDER_API_KEY` | Optional | OpenAI-compatible key for AI analysis | platform.openai.com → API keys |
| `AI_MODEL` | Optional | Model id (default `gpt-4o-mini`) | Provider documentation |
| `EMAIL_PROVIDER_API_KEY` | Optional | Resend API key for alert emails | resend.com → API keys |
| `EMAIL_FROM` | With email | Verified sender, e.g. `SEO Model <alerts@yourdomain.com>` | Resend → Domains |
| `SERP_API_KEY` | Optional | SerpApi key for competitor discovery and suggestions | serpapi.com → API key. You are responsible for complying with SerpApi's terms and search-engine terms. |

Never commit real keys. `.env` is ignored by Git.

### Google Search Console setup

1. In Google Cloud Console create (or select) a project, enable **Google Search Console API**.
2. Configure the OAuth consent screen (External, add your test users while in "Testing").
3. Create an **OAuth client ID** of type **Web application**.
4. Add the authorized redirect URI exactly as `GOOGLE_REDIRECT_URI`.
5. Scope requested: `https://www.googleapis.com/auth/webmasters.readonly` (read-only).
6. Google may show an "unverified app" warning until the OAuth app is verified; that is expected in testing.

Official references: <https://developers.google.com/webmaster-tools/v1/api_reference_index>
and <https://developers.google.com/identity/protocols/oauth2/web-server>.

### PageSpeed Insights

Enable the API in Google Cloud and create a key. Official reference:
<https://developers.google.com/speed/docs/insights/v5/get-started>. The app stores the lab score, metrics and
opportunities and reports field data only when present.

### Competitor discovery

SEO Model does not scrape search engines. Discovery calls a licensed SERP provider adapter (`src/lib/serp.ts`,
currently SerpApi). Without a provider the page explains the connection requirement, and you can import your own
sourced CSV with a named source (`query,url,position,title,country,observed_at`). Adding another provider means
implementing `SerpProvider` and returning it from `getSerpProvider()`.

---

## 5. Monitoring and alerts

- **Daily job:** `vercel.json` schedules `GET /api/cron/monitoring` at `0 6 * * *` (UTC). Vercel Hobby cron jobs
  support daily frequency; more frequent checks need a paid plan or an external scheduler that sends
  `Authorization: Bearer $CRON_SECRET`.
- **Authentication:** the route rejects every request without the exact Bearer token (constant-time comparison). If
  `CRON_SECRET` is not configured it returns 503 and runs nothing.
- **Idempotency:** each project runs once per UTC day (`monitoring_runs.run_key = cron:<project>:<date>`).
- **Confirmation:** transient failures are retried (3 attempts with backoff). Changes must reproduce on a second fetch
  within the run before they become incidents.
- **Deduplication and cooldown:** one open incident per fingerprint; a recently resolved incident is reopened without
  a new notification; reminders are sent at most once per cooldown; `notification_deliveries` has a unique dedupe key.
- **Channels:** email via Resend (if configured); HTTPS webhook with `x-seo-model-signature: sha256=<HMAC-SHA256>`
  when a signing secret is set. Webhook destinations pass the same SSRF policy.
- **Not included in daily alerts:** PageSpeed. PageSpeed runs on demand and results are stored.

Do not treat monitoring as active until the production deployment has `CRON_SECRET` set and the cron job appears in
the Vercel dashboard. You can verify it manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/monitoring
```

---

## 6. Deployment to Vercel

1. **Provision PostgreSQL.** Create a Neon project (or another Vercel-compatible Postgres). Copy the pooled connection
   string with `sslmode=require`.
2. **Import the repository** in Vercel (Framework preset: Next.js). Build command `npm run build`, output default.
3. **Set environment variables** (Production and Preview): `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `CRON_SECRET`,
   and the optional integration variables from §4.
4. **Google OAuth:** add `https://<your-domain>/api/integrations/google/callback` to the OAuth client's authorized
   redirect URIs and set `GOOGLE_REDIRECT_URI` to the same value.
5. **Run migrations** against the production database once (from your machine, with the production `DATABASE_URL`):
   `DATABASE_URL="postgresql://..." npm run db:migrate`. Migrations are committed under `drizzle/`.
6. **Deploy.** `vercel.json` registers the daily cron. Confirm in Vercel → Project → Settings → Cron Jobs.
7. **Smoke test:** open `/api/health` (returns `{"ok":true}` when the database is reachable), sign up, create a project,
   run an audit, and call the cron endpoint with the Bearer token.

Vercel function limits: route handlers that process crawl batches or run monitoring set `maxDuration = 60`. On the
Hobby plan the longest allowed duration is lower; the code bounds each invocation by time budget
(`BATCH_TIME_BUDGET_MS`, 40-second project cutoff in cron), so work resumes in the next call.

---

## 7. Security summary

- **SSRF:** blocked hosts, private/loopback/link-local/metadata/multicast/reserved IPv4 and IPv6 (including
  IPv4-mapped), IP-literal destinations, non-default ports, credentials in URLs, DNS-rebinding defence at connect time,
  revalidation of every redirect, no proxying of user-supplied URLs.
- **Crawler etiquette:** robots.txt Disallow and Crawl-delay honoured, per-project delay, page caps, timeouts, 2 MB
  HTML limit, binary and non-HTML bodies are not downloaded.
- **Credentials:** Google tokens and webhook secrets are AES-256-GCM encrypted (`v1.` envelope) with a key derived from
  `AUTH_SECRET`. They are never returned to clients. The Search Console property list is fetched server-side.
- **Sessions and CSRF:** random 256-bit tokens (hash stored), 30-day expiry, `SameSite=Lax`, `Secure` in production,
  origin check on mutating requests, JSON content type required for bodies.
- **Input validation:** Zod on every route body; CSV size limits; formula-injection escaping on export.
- **Abuse controls:** per-user and per-project quotas via `usage_events` (crawl pages, Search Console syncs and live
  queries, SERP queries, PageSpeed runs, monitoring runs, AI calls).
- **Audit trail:** `audit_logs` records project, audit, integration, monitoring and AI actions.

---

## 8. Known limitations and decisions

- **Authentication** is a dependency-light credentials implementation (scrypt + server sessions) rather than Auth.js.
  It meets the stated requirements, but it does not provide OAuth sign-in with Google/GitHub or email magic links.
- **Crawl scope:** HTML pages reachable from the homepage, sitemaps and same-site links, up to the configured limit.
  The crawler does not render JavaScript, so client-rendered content may be missed. A basic HTML crawler cannot
  report Google's index status; the app does not claim it does.
- **Missing structured data** is not reported as an error by design.
- **Search Console:** data lags about three days; anonymized queries and reporting limits can make totals differ from
  row sums. Only Google-returned metrics are displayed.
- **Competitor classifications** are rule-based judgments (see the in-app explanation). No traffic, domain authority or
  backlink data is shown because no connected source supplies it.
- **Scheduling:** daily only on Vercel Hobby. The cron job does not run until deployment.
- **Fix application:** not implemented for any CMS. The interface records proposals and approvals only.
- **Rate limits** are counted in PostgreSQL and are not perfectly atomic under concurrent requests.
- **Playwright** end-to-end tests are written but were not executed in this environment.

---

## 9. Deployment status

This repository has been built and validated locally (type generation, TypeScript, lint, unit and database tests,
production build). **It has not been deployed to Vercel from this environment** because no Vercel project, Neon database
or Google OAuth client was available to the build process. Complete §6 to deploy, then verify the health endpoint and
the cron job before treating the deployment as live.

## Release readiness

See `docs/RELEASE_READINESS.md` (verification results, Neon pre-migration check, manual GitHub/Vercel steps), `docs/AUTH_AND_EMAIL_SECURITY.md`, `docs/DEPENDENCY_SECURITY.md`, and `docs/AI_SDK_V6_MIGRATION_PLAN.md`.
