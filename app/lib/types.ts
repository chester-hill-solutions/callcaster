import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

export type ENV = {
  SUPABASE_URL: string | undefined;
  SUPABASE_KEY: string | undefined;
  BASE_URL: string | undefined;
};

export type ContextType = {
  supabase: SupabaseClient;
  env: ENV;
};

export type Audience = Database["public"]["Tables"]["audience"]["Row"] | null;
export type Campaign = Database["public"]["Tables"]["campaign"]["Row"] | null;
export type Contact = Database["public"]["Tables"]["contact"]["Row"] | null;

export type WorkspaceTable = Audience | Campaign | Contact | null;

export enum WorkspaceTableNames {
  Audience = "Audience",
  Campaign = "Campaign",
  Contact = "Contact",
}
