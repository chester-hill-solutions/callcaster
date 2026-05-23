export { action } from "./initiate-ivr.action.server";

interface InitiateIVRRequest {
  campaign_id: number;
  user_id: { id: string };
  workspace_id: string;
}

