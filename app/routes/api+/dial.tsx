export { action } from "./dial.action.server";

interface DialRequest {
  to_number: string;
  user_id: string;
  campaign_id: string;
  contact_id: string;
  workspace_id: string;
  queue_id: string;
  outreach_id?: string;
  caller_id: string;
  selected_device?: string;
}

