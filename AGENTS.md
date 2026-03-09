## Learned User Preferences
- When the user says `do the needful`, continue with the most obvious next implementation, cleanup, or verification steps without waiting for repeated confirmation unless blocked.
- For broad bug, typecheck, test, or coverage sweeps, keep iterating until the issue list is exhausted or a real blocker is reached.
- Do not modify, overwrite, or reset the user's existing `.env` or environment variables during setup work.

## Learned Workspace Facts
- `twilio-serverless/**` is deprecated in this repo and can generally be ignored for current runtime and coverage work.
- Local Twilio/calling development uses Localtunnel-style public URLs, and `BASE_URL` should match the current public tunnel URL.
