import type { Tables } from "@/lib/db-types";
import type { Contact } from "@/lib/types";
import type { QueueHouseholdSnapshot } from "@/lib/schemas/api/queue-advance";

export type CampaignQueueState = Tables<"campaign_queue"> & {
  assigned_to_user_id?: string | null;
  provider_status?: string | null;
  queue_state?: string | null;
};

export type QueueItem = CampaignQueueState & {
  contact: Contact;
  advance_snapshot?: QueueHouseholdSnapshot;
};
