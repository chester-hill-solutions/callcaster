# Browser-based softphone via Twilio Voice SDK

CallCaster uses the Twilio Voice SDK running in the browser as its softphone — not a separate softphone app, desk phones, or a mobile app. The browser is the phone. 17 React hooks coordinate device connection, call state machine, predictive dial sync, audio devices, DTMF, mute/hold, and conference bridging. Two softphone wiring paths share one canonical call-session owner (`useCallHandling`): the campaign path (`useTwilioDevice` → `useTwilioConnection` + `useCallHandling` + `useCallDuration`) and the standalone path (`useSoftphoneController` → `useTwilioConnection` + `useCallHandling` directly, for handset/agent desktop). The canonical 7-phase call session state machine: idle → ringing → dialing → connected → connected_with_held → completed → failed. Twilio Voice SDK tokens are minted per-workspace (ADR-0016).

## Considered Options

- **Separate softphone app** — more deployment complexity, no benefit over browser SDK.
- **Desk phones** — no software control, no supervisor coaching, no predictive dial integration.
- **Mobile app** — different SDK, smaller form factor, wouldn't serve volunteer phone banks.

## References

- `app/hooks/call/` (17 hooks: `useCallScreen`, `useTwilioDevice`, `useCallHandling`, `useSoftphoneController`, `usePredictiveCallSync`, etc.)
- `app/lib/twilio/call-session-types.ts` (canonical 7-phase state machine: `CALL_SESSION_PHASES`, `deriveCallSessionPhase`)
- `app/lib/twilio/twilio-call-adapter.client.ts` (Voice SDK method wrappers), `app/components/call/CallScreen.*.tsx` (call screen UI)
- `package.json:76` (`@twilio/voice-sdk`)
