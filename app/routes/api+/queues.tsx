export { loader } from "./queues.loader.server";
export { action } from "./queues.action.server";

interface DequeueRequest {
  contact_id: number;
  household: boolean;
}

interface ResetRequest {
  userId: string;
  campaignId: string;
}

