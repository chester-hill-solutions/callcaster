import type { Database } from "@/lib/db-types";

export type AudienceDetailLoaderData = {
  contacts: Array<{ contact: Database["public"]["Tables"]["contact"]["Row"] }> | null;
  workspace_id: string | undefined;
  audience: Database["public"]["Tables"]["audience"]["Row"] | null;
  audience_id: string | undefined;
  error: string | null;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number | null;
  };
  sorting: {
    sortKey: string;
    sortDirection: "asc" | "desc";
  };
  latestUpload?: {
    id: number;
    status: string;
    progress: number;
    total_contacts: number;
    processed_contacts: number;
    error_message?: string | null;
  } | null;
};
