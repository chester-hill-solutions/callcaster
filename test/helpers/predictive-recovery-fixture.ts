import type { PredictiveCustomerRecovery, RecoveredPredictiveCustomer } from "@/lib/schemas/api/voice-audio";
import type { QueueItem } from "@/lib/types";
import { owner } from "./voice-audio-current-fixture";
import { saved } from "../ui/_helpers/contact-editor";

export const recoveredCustomer: RecoveredPredictiveCustomer = {
  workspace_id: owner.workspaceId, user_id: owner.userId, campaign_id: 42, contact_id: 7, outreach_attempt_id: 17, queue_id: 27,
  call_sid: "CA33333333333333333333333333333333", conference_id: "agent~saved-room",
  conference_sid: "CF11111111111111111111111111111111", conference_sequence: 7, human_state: "joined",
  attempt: { answered_at: "2026-10-31T12:00:00Z", campaign_id: 42, callback_audit: null, contact_id: 7,
    created_at: "2026-10-31T11:59:00Z", current_step: "question-2", disposition: "answered", ended_at: null, id: 17,
    issue_tags: ["support"], lawn_sign: true, membership_sold: null, result: { q1: "saved answer" }, support_level: 2,
    user_id: owner.userId, volunteer_interest: "yes", vote_by_mail: null, workspace: owner.workspaceId },
};
export function recovery(revision = "10", customer: RecoveredPredictiveCustomer | null = recoveredCustomer): PredictiveCustomerRecovery {
  return { revision, customer };
}
export const recoveredContact: QueueItem = {
  id: 27, contact_id: 7, campaign_id: 42, workspace: owner.workspaceId, assigned_to_user_id: null,
  attempt_count: 1, attempts: 1, claimed_at: null, created_at: new Date("2026-10-31T11:59:00Z"), last_attempt_at: null,
  last_attempt_error: null, provider_status: "in-progress", queue_order: 1, queue_state: "dequeued", dequeued_by: null,
  dequeued_at: new Date("2026-10-31T12:00:00Z"), dequeued_reason: "dialed", dispatch_generation: "10000000-0000-4000-8000-000000000099",
  voice_reservation_id: "20000000-0000-4000-8000-000000000099", redial_requested_at: null,
  contact: { ...saved, id: 7, workspace: owner.workspaceId, firstname: "Current customer" },
};
