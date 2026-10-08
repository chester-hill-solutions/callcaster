/** ElevenLabs Scribe v2 realtime: ~$0.0043/min → 0.43 credits/min at 1 credit = $0.01. */
export const TRANSCRIPTION_RATE_CREDITS = 0.43;

/**
 * Cohere Command A coaching cue: ~$0.0001/cue → 0.1 credits.
 *
 * **The rate card is quantised to whole credits**, because credits are
 * `integer` end to end (`workspace.credits`, `transaction_history.amount`, and
 * the ledger RPC's `p_amount`). A cue therefore bills as **1 credit, not 0.1** —
 * a 10x overcharge on the cheapest unit here. That is a deliberate pricing
 * decision, not a rounding artefact: passing the raw `0.1` straight through
 * makes Postgres reject the write (`invalid input syntax for type integer`) and
 * leaves every cue unbilled, which cost more than the overcharge did.
 *
 * Sub-credit pricing would need `numeric` columns and a `numeric` RPC
 * parameter — a migration on the money path. Until someone decides that, the
 * invariant is whole credits and `wholeCreditDebit` enforces it. See #2101.
 */
export const COACHING_CUE_CREDITS = 0.1;

/** ElevenLabs Scribe v2 batch: ~$0.005/call → 1 credit. */
export const TRANSCRIPTION_BATCH_CREDITS = 1;
