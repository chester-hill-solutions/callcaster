# Dual dial modes (manual + predictive)

CallCaster supports two dial modes: manual ("call") where the agent initiates each dial, and predictive where the system auto-dials ahead based on a dial ratio. The call screen branches behavior on `dial_type`: predictive routes to a predictive queue with `usePredictiveCallSync` syncing the predictive state machine (dialing → connected → completed/failed/no-answer); manual routes to a standard queue with agent-initiated dial. The predictive mode uses the `queue-next` worker job (ADR-0007) to pace calls and the `useSupabaseRoom` → SSE (ADR-0005) broadcast to sync state to the agent desktop. Household-aware next-recipient logic (`getNextContact`) works in both modes. This is a core product decision — it determines the entire call flow architecture.

## References

- `app/hooks/call/useCallScreen.ts` (`isPredictive: campaign?.dial_type === "predictive"`)
- `app/hooks/call/usePredictiveCallSync.ts` (predictive state sync), `app/hooks/call/useCampaignDialActions.ts` (mode-branched dial actions)
- `app/lib/getNextContact.js` (household-aware queue traversal), `supabase/functions/queue-next/index.ts` (predictive dispatch tick → worker job in v2)
