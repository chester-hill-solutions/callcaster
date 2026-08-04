# Household as first-class domain entity

Promote household from a boolean flag (`campaign.group_household_queue`) + client-side address grouping to a real domain entity with its own table. Scientifically validated as a targeting unit: a Finnish nationwide RCT (Hirvonen et al. 2024) found that household spillover exceeds 100% of the direct treatment effect — texting one household member mobilized untreated cohabitants, doubling the total household effect. The household entity has: address components, `householdKey` (deterministic from address), voters (typed contacts via FK), `doNotKnock` flag, `lastContactedAt`. Call once, ask for any voter, record outcomes per voter, mark household-level flags. Extract as `@chester-hill-solutions/household` shared package — quick-canvass already has a full `households` pgTable with geocode/ward fields; CallCaster adds phone/voter fields via column extension.

## References

- `door-knocking-field-operations-best-practices.md` ("mark household as do-not-knock for future passes")
- `political-science-course/lesson-05-phone-banking-text-banking.md` (Hirvonen et al. 2024: "over 100% of the direct treatment effect spilled over to untreated household members")
- `app/lib/getNextContact.js` (existing household-aware queue traversal), `app/lib/callscreenActions.ts` (existing client-side household grouping)
- quick-canvass `app/db/schema.ts:312` (`households` pgTable with `householdKey`, address components, geocode, ward)
