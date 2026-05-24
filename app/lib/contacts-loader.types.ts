import type { Database } from "@/lib/database.types";
import type { MemberRole } from "@/lib/member-role";

export type ContactsPagination = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
};

export type ContactListRow = Pick<
  Database["public"]["Tables"]["contact"]["Row"],
  | "id"
  | "firstname"
  | "surname"
  | "phone"
  | "email"
  | "address"
  | "city"
  | "other_data"
  | "created_at"
>;

export type ContactsLoaderData = {
  contacts: ContactListRow[] | null;
  workspace: {
    id: string;
    name: string;
    credits: number;
    feature_flags: unknown;
  } | null;
  error: string | null;
  userRole: MemberRole | null;
  flags: { feature_flags: unknown } | null;
  campaigns: Array<{
    id: string | number;
    title?: string | null;
    status?: string | null;
  }>;
  pagination: ContactsPagination;
  searchQuery?: string;
};
