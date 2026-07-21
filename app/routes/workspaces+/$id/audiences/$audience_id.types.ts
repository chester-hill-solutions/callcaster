import type { Database } from "@/lib/db-types";
import type { ContactListRow } from "@/lib/contacts-loader.types";

export type AudienceDetailLoaderData = {
  contacts: Array<{ contact: ContactListRow }> | null;
  workspace_id: string | undefined;
  audience: Database["public"]["Tables"]["audience"]["Row"] | null;
  audience_id: string | undefined;
  error: string | null;
  /** Present when the audience row loaded but the contacts join failed (#1080). */
  contactsError: string | null;
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
