# Conference-per-call bridging

Outbound campaign calls bridge via Twilio `<Conference>` (not direct `<Dial>` to the agent) to enable supervisor listen/whisper/barge (Twilio conference participant `coach`/`muted` flags) and multi-leg bridge-failure recovery. Conferences are named per-user today; the ACD plan extends to `acd-{queueEntryId}` for inbound. Costs more Twilio resources than direct Dial; enables the contact-center supervisor milestone (M3).

## References

- `app/routes/api+/auto-dial/$roomId.action.server.ts:131,138` (`addToConference`, `endConferenceOnExit: false`), `app/lib/auto-dial.server.ts:107` (`completeAllConferences`)
