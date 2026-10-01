# MoneyTrail — MVP architecture

## 1. Proposed architecture

A modular Next.js App Router application with TypeScript. Reconciliation and exception detection are deterministic domain functions (`src/lib/reconciliation.ts`), not an LLM. The app has two storage modes:

- **Demo mode:** seeded sample data persisted only in the current browser's `localStorage`. A persistent in-product warning says not to upload real statements in this mode.
- **Connected mode:** Supabase Auth + Postgres, accessed with the public anon key and protected by row-level security. Supabase is optional at build/preview time; no bank credentials or service-role key are used in the browser. `supabase/schema.sql` is the deployable schema and RLS policy set.

Uploaded CSV contents are parsed in the browser and normalized records are saved. Raw statement files are not uploaded or retained. This narrows data exposure and avoids requiring a bank API for V1.

## 2. Database schema

All customer, order, transaction, import, match, exception, and audit records carry a `business_id`. Users join businesses through `business_members`. Each business stores its country, default ISO currency and timezone. Registration selects a country and derives the currency (for example, US → USD or NG → NGN); a workspace stores one currency and does not perform foreign-exchange conversion. The `create_business` RPC atomically creates the business and owner membership. RLS checks membership for every read/write. `transaction_matches` preserves match history; `transactions.matched_order_id` is the current one-to-one allocation used by the V1 UI. Order balances are derived from the opening/recorded amount paid plus confirmed incoming transactions, not from an AI-generated figure.

Core relations:

- `auth.users` → `business_members` ↔ `businesses`
- `businesses` → `customers`, `orders`, `transactions`, `imports`, `exceptions`, `audit_logs`
- `customers` → `orders`
- `transactions` ↔ `orders` through current allocation and append-only `transaction_matches`
- `exceptions` point to an order or transaction and carry an evidence JSON object plus a stable fingerprint

Schema details, uniqueness constraints, indexes, RLS, and the onboarding RPC are in `supabase/schema.sql`.

## 3. Core user flows

1. **First visit:** demo data makes the value visible immediately. In connected mode the owner selects a country at registration, creates a business using that country’s default currency, then adds data.
2. **Orders:** manually create an order or import an order CSV. Customers are upserted by normalized phone when present; otherwise by normalized name.
3. **Transactions:** upload a bank/POS/gateway CSV → preview → map columns → validate → identify duplicate candidates → import all valid rows with review flags → run reconciliation.
4. **Reconciliation:** high-confidence, unique matches are linked with a visible reason; medium-confidence suggestions remain unlinked until the owner reviews them. Low-confidence transactions stay unmatched.
5. **Exceptions:** each exception includes the evidence and a concrete next action: review/match, send a WhatsApp-ready reminder, mark a duplicate as legitimate, or resolve after investigation.
6. **Reports:** download normalized transaction/order data and a period reconciliation summary as CSV.

## 4. Matching logic

Normalize whitespace, punctuation, phone digits, order references, and names. Compare each positive incoming transaction to open orders only. Deterministic score (bounded to 1.0):

- exact order reference in description/reference: +0.52
- exact normalized customer phone: +0.24
- strong customer-name token match: +0.20
- transaction equals remaining order balance (± 1 workspace currency unit): +0.18
- transaction is a plausible partial amount: +0.07
- date within 3 days: +0.10; within 7 days: +0.05

A result is **Matched — high confidence** only at score ≥ 0.78 and with a ≥ 0.12 margin over the next candidate. Scores from 0.42 to the high-confidence threshold become **Possible match — review required**. No candidate or a lower score stays unmatched. Debits, duplicate candidates, already-allocated transactions, and fully settled orders are not auto-matched. Manual confirmation is always available and creates an audit/match record. This is a suggestion system, not proof of payment.

## 5. Exception logic

- `UNMATCHED_PAYMENT`: positive incoming transaction has no confirmed order allocation.
- `UNPAID_ORDER`: no paid amount and payment is due/past due.
- `PARTIAL_PAYMENT`: some payment is confirmed but an amount remains, before due date.
- `OVERDUE_PAYMENT`: due date has passed and an amount remains.
- `POSSIBLE_DUPLICATE`: same reference, or a close date/amount/sender/description fingerprint. Never auto-delete or call it fraud.
- `AMOUNT_MISMATCH`: an explicit full/final settlement reference does not equal the order's remaining amount; report expected, received, and difference.
- `UNUSUAL_TRANSACTION`: rule-based amount outlier requiring a human check, not a fraud verdict.

Stable fingerprints prevent duplicate exception rows. When a correction makes an exception disappear, it is marked resolved by the reconciliation update; if the same condition returns it can be reopened. The dashboard's “money requiring attention” is outstanding order balances + unallocated incoming funds, excluding the follower row in a known duplicate pair. Mismatch and duplicate flags are review explanations, not extra amounts added on top of the order/transaction values, to avoid double-counting.

## 6. Folder structure

```text
app/                    Landing page and authenticated workspace routes
src/components/         App shell, forms, dialogs, tables, CSV import wizard
src/lib/types.ts        Domain model and shared types
src/lib/localization.ts Country list, country-to-currency defaults and locale helpers
src/lib/seed.ts         Realistic, generated Nigerian demo workspace
src/lib/csv.ts          CSV parsing, field inference, mapping and validation
src/lib/reconciliation.ts  Matching, balances, exception rules and attention totals
src/lib/supabase.ts     Optional browser Supabase client
src/components/MoneyTrailProvider.tsx  Demo persistence + Supabase workspace adapter
supabase/schema.sql     PostgreSQL schema, RLS policies and business bootstrap RPC
docs/architecture.md   This architecture, product rules and risks
```

## 7. Implementation sequence

1. Domain types, generated demo data, money/date utilities, matching and exception tests.
2. Responsive landing page, app shell, navigation, dashboard and visible demo-mode privacy notice.
3. Customer/order CRUD and import wizard.
4. Transaction CSV preview/mapping/validation/deduplication and import history.
5. Matching review, exceptions, WhatsApp-ready reminders, reports and CSV exports.
6. Supabase Auth/workspace adapter and SQL/RLS. Verify the demo works with no credentials and connected mode cannot read across businesses.
7. Production build, typecheck, lint, domain tests, and manual preview checks.

## 8. Main technical/product risks

- **Statement formats vary:** a CSV mapping/preview is safer than claiming universal auto-import. Validate date/amount, keep the original description, show duplicate candidates, and do not silently discard valid rows.
- **False matches are costly:** high thresholds, clear evidence, human review for uncertain matches, reversible links, and audit history are required.
- **Incomplete records:** offline cash or sales not entered into orders are invisible to reconciliation. The interface must state its coverage (imported orders and transactions), not claim it found every leak.
- **No bank API in V1:** open-banking access is consented and governed by CBN participant/API agreements; a public API key does not grant lawful access. CSV is the honest first integration.
- **Sensitive customer/payment data:** minimize collected fields, encrypt transport/storage, use RLS and audit logs, provide deletion/export, and review privacy obligations with counsel in each launch market. Nigeria-facing deployments also need NDPA/NDP Act review.
- **WhatsApp cost/policy changes:** V1 uses an explicit click-to-chat link. Automated reminders later require approved templates/consent and changing Meta rates.
- **SME willingness to pay and workflow adoption are unproven:** test with 10 wholesalers/retailers, manually reconcile one statement each, then charge for recovered/identified exceptions before broad integrations.

## 9. Implementation status (MVP)

Implemented in this repository:

- Responsive landing page and workspace pages for overview, customers, orders, transactions, exceptions, reports and settings.
- Browser-local demo with the requested 50 / 100 / 200 fictional data scale and visible privacy warnings.
- Country-aware registration/workspace setup, default currency and money formatting, plus timezone-aware date display. A workspace uses one currency; MoneyTrail does not convert FX.
- CSV preview, field mapping, country-aware DD/MM vs. US MM/DD and ISO date parsing, currency-symbol/code validation, separate credit/debit columns, duplicate marking, import counts and exports.
- Deterministic matching, match-review, amount-safe manual allocation, exception generation/actions and copy/WhatsApp-ready reminder drafts.
- Optional Supabase email/password authentication, workspace creation/loading and RLS-protected persistence using the public anon key only.
- Unit tests for deterministic matching, seed scenarios, date/amount parsing and CSV validation.

Local verification completed: `npm run typecheck`, `npm run lint`, `npm test` (23 tests), `npm run build`, and `npm audit --audit-level=moderate` pass with zero vulnerabilities. The app was also served on the Arena preview port and all workspace routes returned HTTP 200.

Not yet production-verified: the SQL migration has not been applied to a real Supabase project; auth email settings and cross-business isolation have not been integration-tested against two accounts; no country-specific bank CSV corpus or real customer interviews have been tested; and privacy counsel in intended launch markets should review retention, lawful basis, access, export and deletion before launch. Demo localStorage is explicitly not secure production storage.
