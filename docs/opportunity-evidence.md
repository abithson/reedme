# MoneyTrail — preliminary Nigeria opportunity evidence

**Status: desk-research memo, not customer validation.** This is a focused check on the selected MoneyTrail wedge, not the full cross-sector Nigerian opportunity scan requested earlier. No merchant interviews, observed reconciliation sessions, systematic app-review sample, willingness-to-pay tests or verified local traction have been completed. Do not treat the hypotheses below as established demand.

## Product hypothesis

> Nigerian wholesalers, distributors and multi-channel retailers who collect transfers, cash and POS payments against orders may spend material owner/staff time figuring out which payment belongs to which sale. A simple evidence layer could help them find unresolved balances and unmatched credits without requiring a bank integration or replacing WhatsApp, POS, accounting or inventory tools.

The product decision is to test **manual reconciliation above existing systems**, starting with user-selected CSVs. It is not a claim that this is Nigeria’s largest or most painful business problem.

## What the available evidence does and does not say

| Evidence | What it supports | What it does not prove |
|---|---|---|
| Research ICT Africa’s [Nigeria microenterprise adoption report](https://researchictafrica.net/research/digital-technology-adoption-in-microenterprises-nigeria-report/) surveyed 718 microenterprises face-to-face in July–August 2022 (defined there as at most 10 employees). The report describes substantial differences between phone ownership, smartphone access, internet use and formal record keeping; only 32% explicitly separated business and personal financial flows. | Mobile access and bookkeeping/formality constraints are relevant design conditions; a “mobile-first / low setup” assumption deserves testing. | This is not a current census, not evidence that users reconcile bank statements manually, and not evidence of demand or willingness to pay for MoneyTrail. Its sample and definitions matter. |
| CBN’s [payment modes page](https://www.cbn.gov.ng/PaymentsSystem/modes.html) reports very large Nigerian electronic-payment activity; H1 2024 included 5.626bn NIP transfers worth ₦476.89tn. | Digital transfer evidence is an important part of the payment environment. | National payment volume does not identify business-to-customer flows, reconciliation work, small-merchant pain, or a software market. |
| IFC’s [Nigeria Market Bite](https://www.ifc.org/en/insights-reports/2022/market-bite-nigeria-innovation-offers-key-to-the-broader-msme-finance-market) estimates ₦13tn in unmet MSME credit demand from research conducted in 2021–22. | Small-business finance constraints provide context for preserving accurate records. | This is not a reconciliation-software TAM, a spending budget, or proof that better records will unlock credit. |
| PwC’s [MSME Survey 2024](https://www.pwc.com/ng/en/assets/pdf/pwc-msme-survey-report-2024.pdf) reports 557 respondents across 13 sectors and 29 states, but says the online survey was administered in 2022. PwC’s [2020 survey](https://www.pwc.com/ng/en/assets/pdf/pwc-msme-survey-2020-final.pdf) reported payment delays for some MSMEs selling to large corporates. | Receivables and delayed payment deserve segment-specific investigation. | These dated / online samples do not establish current prevalence among informal wholesalers, social sellers or all Nigerian MSMEs. Large-corporate delays are not the same as unmatched bank credits. |
| SMEDAN/NBS business-count figures (often repeated from 2020, including roughly 39.65m MSMEs) are summarized in [FATE Foundation’s 2022 competitiveness report](https://fatefoundation.org/wp-content/uploads/2024/03/7.-SMEDAN-1.pdf). | There is a very large and heterogeneous business population. | A national count is not an addressable-market estimate. It says nothing about ability to adopt, access, price, sales cost or product fit. |
| The [Journal Nigeria](https://thejournalnigeria.com/the-hidden-labour-behind-online-businesses/) gives qualitative social-commerce order/dispatch examples; [Catlog’s 2022 coverage](https://techcabal.com/2022/04/07/catlog-wants-to-improve-social-commerce-in-nigeria/) describes order capture for WhatsApp sellers. | WhatsApp/social selling and manual order work are plausible workflows to investigate. | These are qualitative/editorial or company descriptions, not representative customer research, and do not independently validate reconciliation demand. |

### Facts, reports, claims and hypotheses

- **Verified from cited reports:** the study dates, sample sizes, survey methods and the specific reported payment/digital-adoption figures above (subject to each report’s definitions).
- **Company claims, not independent proof:** product feature descriptions on competitor websites. A vendor testimonial or marketing page is not evidence of retained usage, measured outcomes or market size.
- **Inference:** where bank transfers, cash, POS, gateway payouts, WhatsApp orders and informal records coexist, matching an order list to an exported transaction list could require manual work.
- **Unverified hypothesis:** enough Nigerian wholesalers/distributors encounter that work frequently, can supply usable order/statement data, trust an external tool with the evidence, and will pay for its resolution.

## Segment and workflow to investigate first

### Primary test segment: independent wholesalers / distributors

Look for owner-managed firms with repeat customer orders, multiple payment methods, at least one exported digital statement and a separate order record (book, spreadsheet, POS export or WhatsApp). Do not assume every distributor offers credit or uses a formal ERP. Observe how they handle:

1. order creation and customer identity (shop name, owner, phone, WhatsApp chat, reference);
2. transfer screenshots and payment notifications versus the bank statement’s final record;
3. split/partial payments, cash, POS batches, gateway settlement timing and fees;
4. credit terms, due dates, dispatch proof and corrections/returns;
5. daily or weekly matching, who does it, what they cannot resolve, and what happens next.

### Secondary test segment: WhatsApp / social-commerce sellers

Establish whether the main loss is order capture, fulfilment, proof-of-payment checking, or later reconciliation. MoneyTrail should not drift into replacing catalogues, messaging, dispatch, invoicing or POS if the observed pain is elsewhere.

### Required discovery evidence

For each interview, ask to see a recent, redacted example and have the operator show the current workaround. Record exact steps, tools, frequency, time, errors and consequences. Distinguish first-hand observation from recollection. Never ask to see a bank password or an unredacted statement unless the merchant knowingly chooses to supply it in a properly secured research environment; the demo must use synthetic data only.

## Competitive and substitute map

| Product / substitute | Publicly described overlap | Interpretation / evidence quality |
|---|---|---|
| [OnCRE](https://www.getoncre.com/) | Credit tracking, reminders and recovery. | Directly overlaps receivables follow-up. Feature and testimonial statements are vendor-published; independently verify active use, reliability, pricing and outcomes. |
| [Bumpa](https://www.getbumpa.com/pricing) | Store/orders, payment requests and reconciliation features. | Important direct overlap. Product/pricing pages are vendor claims; test whether its workflow already resolves imported bank evidence for the target wholesale segment. |
| [Oze](https://getoze.com/business-app/) | Bookkeeping, receivables/reminders, inventory and transaction capture. | Adjacent/overlapping bookkeeping and debtor workflow; verify local fit and current product scope with users. |
| [Moniebook](https://moniepoint.com/moniebook) | POS, inventory, bookkeeping and CRM positioning, including offline-first claims. | A broad incumbent/substitute that may already solve the problem for some merchants. Do not assume the user needs a separate tool. |
| [Tracepos](https://www.tracepos.net/) and [Veedez](https://blog.veedez.com/post/bookkeeping-and-inventory-app-for-nigerian-smes) | POS, wholesale/warehouse, ledger, inventory or bookkeeping claims. | Potential substitutes for organized wholesalers; overlap is based on vendor material, not independent comparative testing. |
| [Catlog](https://play.google.com/store/apps/details?id=shop.catlog.app) | Social-commerce/catalogue and order workflow. | May solve order capture rather than the bank-to-order reconciliation layer. Current usage and exact capability require direct testing. |
| Paper notebook, calculator, bank app, screenshots, spreadsheets, POS exports, WhatsApp search, bookkeeper/accountant | No subscription; flexible and already embedded in the workflow. | The strongest practical competition may be “good enough manual work.” Measure time and mistakes before claiming superiority. |

**Crowding check:** debtor tracking, reminders, bookkeeping, POS and order management are already crowded feature areas. MoneyTrail’s candidate wedge is narrower: statement evidence → imported orders → explainable allocations/exceptions → human action. Even that distinction is only useful if target users currently perform the matching outside the tools they already have.

## Market, monetization and ROI — no invented TAM or price

Do not multiply a national MSME count by an assumed conversion rate. Build a bottom-up serviceable market only after identifying a repeatable segment, list source, reachability, data readiness, onboarding cost and buyer authority.

For a pilot customer, estimate monthly value from measured inputs:

`observed reconciliation hours saved × their stated loaded hourly cost`

`+ confirmed recoverable / prevented missed payments (only after the merchant verifies each case)`

`− onboarding, review and support time`

Keep **identified discrepancy value** separate from **money actually recovered**. A flagged row is not revenue. Test willingness to pay with a real offer after a manual concierge reconciliation; do not infer willingness from enthusiasm or from the value of an unpaid invoice.

Potential channels to test—not established channels—include distributor/retailer associations, bookkeepers serving wholesalers, POS/accounting resellers and referrals between trading partners. Measure the cost and trust burden of each; avoid a broad paid-acquisition plan until retention and ROI are observed.

## Validation plan before expanding the product

1. Interview 10 owner/managers across wholesalers, distributors and retailers; separately interview 5 WhatsApp sellers. These are proposed sample sizes, not completed interviews.
2. Observe each participant reconcile one recent period using their normal records. Capture a redacted order file and statement only with informed permission; otherwise use screenshare or let the merchant operate their own device.
3. Manually reconcile the evidence alongside the merchant. For every suggested match, ask the merchant to confirm or reject it; record false positives and unresolved cases.
4. Measure: weekly reconciliation frequency, minutes spent, imported rows, share of orders with reliable references/phones, ambiguous-match rate, confirmed discrepancies, time-to-resolution, records the merchant refuses to share, and who controls the budget.
5. Run a concierge prototype with CSVs only. Test whether users return for a second period without prompting and whether an owner will pay a stated, non-discounted amount after observing verified value.
6. Pre-register stop/change criteria. Example pilot gates to debate before fieldwork: at least 6/10 wholesalers show a recurring manual reconciliation step; at least 4 can provide usable data without extensive cleanup; at least 3 return for a second period and accept a paid trial. If those gates fail, change the customer/workflow rather than adding AI or bank integrations.

## Regulation, security and product boundary

- The [CBN Open Banking Operational Guidelines](https://www.cbn.gov.ng/Out/2023/CCD/Operational%20Guidelines%20for%20Open%20Banking%20in%20Nigeria.pdf) describe registered participants, consent and permissioned access. A public client key is not permission to fetch bank data. CSV-first is the honest V1 boundary.
- The [Nigeria Data Protection Commission](https://ndpc.gov.ng/) publishes the NDP Act and the 2025 GAID. Before handling real customer/payment data, obtain Nigerian privacy advice on lawful basis, transparency, data minimization, processor/controller roles, security, retention, access/export/deletion, incident response and any registration obligations.
- Keep bank credentials, payment initiation, automated withdrawals and credit scoring out of scope. A reminder is a draft/click-to-chat action, not automated WhatsApp messaging; automated business-initiated messages would require separate policy, consent and cost review.
- Treat a CSV as sensitive input. Parse in the browser, cap file size, preview mappings, validate and deduplicate visibly, avoid retaining the raw file or unmapped columns, and isolate connected workspaces at the database layer.

## Current decision

Proceed with the narrow MVP already implemented in this repository, but treat product–market fit as **unproven**. Do not add bank APIs, automated WhatsApp, inventory, accounting, payroll, lending or AI matching until observed user evidence identifies a specific blocker. The next highest-value work is merchant discovery and a real-data (properly consented, securely handled) concierge pilot—not additional feature breadth.
