export { action } from "./outreach-attempts.action.server";

interface OutreachAttemptRequest {
  campaign_id: number | string;
  contact_id: number | string;
  queue_id: number | string;
}

