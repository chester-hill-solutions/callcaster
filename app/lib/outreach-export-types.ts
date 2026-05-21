import type { Json } from "./database.types";
import type { Database } from "./database.types";

export type OutreachExportData = {
  answered_at: string | null;
  campaign_id: number;
  contact_id: number;
  created_at: string;
  current_step: string | null;
  disposition: string | null;
  ended_at: string | null;
  id: number;
  result: Json;
  user_id: string | null;
  workspace: string;
  contact: Database["public"]["Tables"]["contact"]["Row"];
  calls: { duration: number }[];
};
