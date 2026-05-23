import {
  data as routeData,
  type LoaderFunctionArgs,
} from "react-router";

import { buildContactSearchFilter } from "@/lib/contacts/search.server";
import type { Database } from "@/lib/database.types";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { User } from "@/lib/types";
import { MemberRole } from "@/lib/member-role";

const ITEMS_PER_PAGE = 20;
const MAX_PAGE_SIZE = 100;

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

function errorPayload(
  partial: Omit<ContactsLoaderData, "pagination"> & {
    pagination?: Partial<ContactsPagination>;
  },
  pageSize: number,
): ContactsLoaderData {
  return {
    contacts: partial.contacts ?? null,
    workspace: partial.workspace ?? null,
    error: partial.error ?? null,
    userRole: partial.userRole ?? null,
    flags: partial.flags ?? null,
    campaigns: partial.campaigns ?? [],
    pagination: {
      currentPage: partial.pagination?.currentPage ?? 1,
      totalPages: partial.pagination?.totalPages ?? 0,
      totalCount: partial.pagination?.totalCount ?? 0,
      pageSize: partial.pagination?.pageSize ?? pageSize,
    },
    searchQuery: partial.searchQuery,
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  try {
    const { supabaseClient, headers, user } = await verifyAuth(request);
    const url = new URL(request.url);
    const rawSearchQuery = url.searchParams.get("q") ?? "";
    const searchQuery = rawSearchQuery.trim().replaceAll(",", " ");

    const pageParam = url.searchParams.get("page");
    const page = Math.max(1, parseInt(pageParam || "1"));
    const pageSize = Math.min(ITEMS_PER_PAGE, MAX_PAGE_SIZE);

    const workspaceId = params.id;
    if (!workspaceId) {
      return routeData(
        errorPayload(
          {
            contacts: null,
            workspace: null,
            error: "Workspace ID is required",
            userRole: null,
            flags: null,
            campaigns: [],
          },
          pageSize,
        ),
        { headers, status: 400 },
      );
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        workspaceId,
      )
    ) {
      return routeData(
        errorPayload(
          {
            contacts: null,
            workspace: null,
            error: "Invalid workspace ID format",
            userRole: null,
            flags: null,
            campaigns: [],
          },
          pageSize,
        ),
        { headers, status: 400 },
      );
    }

    const countQuery = supabaseClient
      .from("contact")
      .select("*", { count: "exact", head: true })
      .eq("workspace", workspaceId);

    const contactsQuery = supabaseClient
      .from("contact")
      .select(
        "id, firstname, surname, phone, email, address, city, other_data, created_at",
      )
      .eq("workspace", workspaceId)
      .range((page - 1) * pageSize, page * pageSize - 1)
      .order("created_at", { ascending: false });

    const campaignsQuery = supabaseClient
      .from("campaign")
      .select("id, title, status")
      .eq("workspace", workspaceId)
      .order("created_at", { ascending: false });

    if (searchQuery) {
      const searchFilter = buildContactSearchFilter(searchQuery);
      if (searchFilter) {
        countQuery.or(searchFilter);
        contactsQuery.or(searchFilter);
      }
    }

    const [
      userRoleResult,
      workspaceResult,
      flagsResult,
      countResult,
      contactsResult,
      campaignsResult,
    ] = await Promise.all([
      getUserRole({
        supabaseClient,
        user: user as unknown as User,
        workspaceId,
      }),
      supabaseClient
        .from("workspace")
        .select("id, name, credits, feature_flags")
        .eq("id", workspaceId)
        .single(),
      supabaseClient
        .from("workspace")
        .select("feature_flags")
        .eq("id", workspaceId)
        .single(),
      countQuery,
      contactsQuery,
      campaignsQuery,
    ]);

    const userRole = userRoleResult?.role || null;
    const { data: workspace, error: workspaceError } = workspaceResult;
    const { data: flags, error: flagsError } = flagsResult;
    const { count: totalCount, error: countError } = countResult;
    const { data: contacts, error: contactError } = contactsResult;
    const { data: navCampaigns, error: campaignsError } = campaignsResult;
    if (campaignsError) {
      logger.error("Failed to load campaigns for workspace nav:", campaignsError);
    }
    const campaigns = navCampaigns ?? [];

    if (!userRole) {
      return routeData(
        errorPayload(
          {
            contacts: null,
            workspace: null,
            error: "You don't have access to this workspace",
            userRole: null,
            flags: null,
            campaigns: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalCount: 0,
              pageSize,
            },
          },
          pageSize,
        ),
        { headers, status: 403 },
      );
    }

    if (workspaceError || !workspace) {
      return routeData(
        errorPayload(
          {
            contacts: null,
            workspace: null,
            error: "Workspace not found",
            userRole,
            flags: null,
            campaigns: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalCount: 0,
              pageSize,
            },
          },
          pageSize,
        ),
        { headers, status: 404 },
      );
    }

    const errors = [contactError, countError, flagsError].filter(Boolean);
    if (errors.length > 0) {
      logger.error("Database errors:", errors);
      return routeData(
        errorPayload(
          {
            contacts: null,
            workspace,
            error: "Failed to load contacts. Please try again.",
            userRole,
            flags: null,
            campaigns,
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalCount: 0,
              pageSize,
            },
          },
          pageSize,
        ),
        { headers, status: 500 },
      );
    }

    const totalCountValue = totalCount || 0;
    const totalPages = Math.ceil(totalCountValue / pageSize);

    if (page > totalPages && totalPages > 0) {
      return routeData(
        errorPayload(
          {
            contacts: null,
            workspace,
            error: `Page ${page} does not exist. Total pages: ${totalPages}`,
            userRole,
            flags,
            campaigns,
            pagination: {
              currentPage: 1,
              totalPages,
              totalCount: totalCountValue,
              pageSize,
            },
          },
          pageSize,
        ),
        { headers, status: 400 },
      );
    }

    return routeData(
      {
        contacts: contacts || [],
        workspace,
        error: null,
        userRole,
        flags,
        campaigns,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount: totalCountValue,
          pageSize,
        },
        searchQuery,
      } satisfies ContactsLoaderData,
      { headers },
    );
  } catch (error) {
    logger.error("Unexpected error in contacts loader:", error);
    return routeData(
      errorPayload(
        {
          contacts: null,
          workspace: null,
          error: "An unexpected error occurred. Please try again.",
          userRole: null,
          flags: null,
          campaigns: [],
        },
        ITEMS_PER_PAGE,
      ),
      { status: 500 },
    );
  }
};
