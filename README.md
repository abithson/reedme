# MoneyTrail

**Know where your business money went — and what needs your attention.**

MoneyTrail is a country-aware, CSV-first reconciliation layer for businesses. It compares customer orders with bank, POS and gateway transaction evidence without replacing existing systems or taking payment credentials. The workspace country sets its default currency and number formatting; amounts are not converted between currencies. The seeded sample remains a fictional Nigerian wholesale business.

## Run the demo locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and choose **Open sample workspace**. The sample has 50 fictional customers, 100 orders and 200 transaction rows, including matched, partial, overdue, unmatched, possible-duplicate and amount-mismatch cases. Changes are stored in this browser’s local storage.

**Do not upload real statements or customer data in demo mode.** This is a local prototype, not secure storage. Reset the sample from **Settings**.

## Main flows

- Create/import customers and orders.
- Import transactions from CSV: preview the file, map columns, validate dates/amounts, inspect duplicate candidates and review the import summary. Supports country-aware date entry, common currency symbols/codes and separate Credit/Debit columns.
- Review deterministic transaction-to-order suggestions. High-confidence unique matches can be linked; uncertain matches stay unallocated until a person confirms them.
- Review unpaid, partial, overdue, unmatched, possible-duplicate, amount-mismatch and unusual-transaction exceptions.
- Draft/copy a payment reminder or open a WhatsApp chat yourself. MoneyTrail does not automate messages.
- Export transaction, order, exception and reconciliation-summary CSVs.

## Optional connected mode (Supabase)

1. Create a Supabase project and configure Auth for email/password.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. Re-running it on an earlier NGN-only install adds the country field, relaxes the currency constraint and renames amount columns without changing stored values.
3. Copy `.env.example` to `.env.local`; set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Restart the app, create an account, select your country, then create a business workspace. The country determines the initial ISO currency (for example, United States → USD and Nigeria → NGN); this is a display/storage unit, not an exchange-rate conversion.

The browser uses only the public anon key. Database RLS, security-definer membership helpers and composite same-business foreign keys protect connected records. **Never put a service-role key in client code.** Connected-mode SQL/auth/isolation still needs deployment-environment verification before production use. Raw CSV files are parsed in the browser and not retained; normalized records are persisted to Supabase in connected mode.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run typecheck` — TypeScript checks
- `npm run lint` — ESLint
- `npm test` — deterministic matching, seed and CSV tests

See [`docs/architecture.md`](docs/architecture.md) for schema, matching, exception rules, implementation notes and risks.
