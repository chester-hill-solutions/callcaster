export { action } from "./questions.action.server";

import type { Json } from "@/lib/database.types";

interface RequestData {
  update?: Json;
  contact_id: number;
  campaign_id: number;
  workspace: string;
  disposition: string;
  queue_id: number;
}

