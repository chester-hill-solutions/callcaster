# Per-workspace Twilio Voice SDK tokens

Browser calling devices get capability tokens scoped to the workspace's Twilio subaccount (API key + secret from `workspace.key`/`workspace.token`), not the main account credentials. Pairs with ADR-0011 (subaccount-per-workspace) but is a distinct decision about token minting for the Voice SDK. The token route fetches workspace credentials, generates a Twilio `AccessToken` with `VoiceGrant` (using `TWILIO_APP_SID`), and returns it to the browser.

## References

- `app/routes/api+/token.loader.server.ts:30-51` (fetches workspace key/token, generates token), `app/routes/api+/handset-token.loader.server.ts`, `app/lib/twilio-token.server.ts` (`generateToken`)
