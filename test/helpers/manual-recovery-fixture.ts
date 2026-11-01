import type { RecoveredManualCustomer } from "@/lib/schemas/api/voice-audio";
import { recoveredCustomer } from "./predictive-recovery-fixture";

export function manualRecovery(overrides: Partial<RecoveredManualCustomer> = {}): RecoveredManualCustomer {
  const { conference_sid: _sid, conference_sequence: _sequence, human_state: _human, ...subject } = recoveredCustomer;
  return { ...subject, reservation_id: "50000000-0000-4000-8000-000000000001", dial_intent_id: "60000000-0000-4000-8000-000000000001",
    agent_call_sid: "CA11111111111111111111111111111111", provider_status: "in-progress",
    request: { to_number: "+16135550123", caller_id: "+16135550124", selected_device: "+16135550125",
      requested_outreach_attempt_id: null, queue_generation: "40000000-0000-4000-8000-000000000001",
      audio_connection_id: "30000000-0000-4000-8000-000000000001", audio_generation: 4 }, ...overrides };
}
