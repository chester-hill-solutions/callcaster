# Call-in verification numbers are platform data, not an environment variable

An operator configured the number an agent dials to verify a handset by setting
`VERIFICATION_PHONE_NUMBER` in the app environment and pointing that number's
Twilio Voice webhook at `/api/inbound-verification`. That holds exactly one
number, changing it needs a redeploy, and nothing in the app shows the value.
The platform expects to grow past one number for bandwidth and regions.

## Decision

Store verification numbers in `verification_number`, a global (non-tenant)
table, and mark the one in use as active. The app reads the active row.

- `getActiveVerificationNumber()` backs `/api/verify-call-in-session`; no
  registered active number returns the existing feature-unavailable response.
- A partial unique index forbids a second active row, so a switch cannot leave
  two active numbers even for an instant.
- `scripts/configure-verification-number.mjs` writes the Twilio webhook and
  registers and activates the row in one transaction.
- The Admin dashboard's System Settings tab lists the numbers and can register,
  activate, and remove them.

`VERIFICATION_PHONE_NUMBER` is removed from the environment. The number changes
without a redeploy.

## Considered options

- **Keep the environment variable.** Rejected: one number, a redeploy to change,
  and the value is invisible in the app.
- **A generic key/value platform setting.** Rejected: it does not model several
  numbers, which is the stated growth path, and it invites unrelated configuration
  into one untyped row.
- **A per-workspace number.** Rejected: the number is CallCaster-owned platform
  infrastructure, not tenant data. Every workspace dials the same one.
- **Build only the Admin surface.** Rejected: the admin panel is a mockup today;
  the value needs a real home first.

## Consequences

- The number is visible and changeable in Admin. `verification_number` is global
  and read through `adminDb`, like other platform tables.
- `region` and `label` exist for the growth path but do not affect selection yet;
  the single active row is the number used.
- Registering a number does not authenticate a call by itself. The inbound
  Twilio webhook still matches a pending session by caller ID.
- Removing the active number is safe: the route returns the feature-unavailable
  response instead of dialing nothing.

## References

- [Issue #2519](https://github.com/chester-hill-solutions/callcaster/issues/2519)
- [Issue #2105](https://github.com/chester-hill-solutions/callcaster/issues/2105)
