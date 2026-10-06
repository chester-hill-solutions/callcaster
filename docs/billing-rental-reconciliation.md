# Rental reconciliation

Rental reconciliation compares renewal charges for the last complete UTC calendar month. SMS, MMS and voice retain their existing rolling window. The admin report, saved snapshot and drift email state the rental period separately.

Twilio reports local, mobile and toll-free rental quantities in `numbers`. Each initial prepaid month also has a `phonenumbers-setups` event in `number-setups`; this first charge is separate from renewals. Reconciliation subtracts those initial units and excludes `number_rent_purchase:` debits. Setup counts must match the known initial rental history. It never adds the `phonenumbers` aggregate to its subtypes, or counts emergency, CPS or porting fees as rental renewals.

The recurring ledger is selected by `number_rent:<numberId>:YYYY-MM`, including catch-up debits posted after that month. Negative debit credits are converted to renewal units at the canonical monthly rate. Initial purchase debits remain in the cash ledger total. Invalid signs, quantities, keys or identities leave the comparison unavailable.

The existing 2026-04-01 rollout exemption remains. Active rented numbers and saved release intents provide their original creation dates. A release intent and its completion bound the provider release; if that interval spans a renewal, the month is unavailable. An old-account release cannot offset the current account. Known purchase-account conflicts and missing provider identities also leave coverage unavailable. Provider renewal quantities must match the known number history before a numeric comparison is recorded. Missing history is not invented or backfilled.

`numbersVariance` and `numbersPeriod` pass through the material predicate, alert details, snapshot normalization, drift marker, structured log and email. An absolute numeric gap greater than 2 is material. An unavailable rental comparison remains explicit and cannot clear an existing alert. Email still sends once per drift episode to the existing owner/admin recipients; balance clears the marker and re-arms a later episode. Ledger signs, credit mutation and billing ownership do not change.

A failed monthly provider read records rental coverage as unavailable and logs its workspace and period. It retains the existing rolling SMS, MMS and voice results. The report builder requires an explicit rental input; a missing load is not a verified empty history.

Older snapshots retain their existing dates and values. Missing rental fields have the compatibility default and no recorded rental period; no historical numeric variance is reconstructed. New runs record their actual rental comparison.

## Evidence and limits

Read-only main-account provider records checked on 2026-10-06 showed three September local rental events and one emergency event in the aggregate. Each of the three held numbers' initial provisioning windows had one local rental event and one setup event. This establishes the observed unit and overlap contract, not customer-tenant or release acceptance. Provider reads, local real database tests and deployed candidate QA are separate evidence.

Provider references: [Usage Records](https://www.twilio.com/docs/usage/api/usage-record), [phone-number billing](https://help.twilio.com/articles/223182908). Candidate QA must check a real tenant's supported categories, setup/renewal separation, billing month, rollout exemption, release history and recovery before default-branch promotion.
