export { action } from "./campaign_queue.action.server";

interface ContactMapping {
  id: number;
  contact_id: number;
  campaign_id: number;
  status: string;
  created_at: string;
  contact: {
    id: number;
    firstname: string | null;
    surname: string | null;
    phone: string | null;
    email: string | null;
    [key: string]: unknown;
  };
}

