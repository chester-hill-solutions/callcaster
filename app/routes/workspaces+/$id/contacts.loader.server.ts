import { data as routeData } from "react-router";
import { getUserRole } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { listWorkspaceContactsApi } from "@/lib/platform-data.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { verifyAuth } from "@/lib/supabase.server";
import { createTenantDb } from "@/server/tenant-db";
import type { LoaderFunctionArgs } from "react-router";

const ITEMS_PER_PAGE = 20;
const MAX_PAGE_SIZE = 100;

import type { ContactsLoaderData, ContactsPagination, ContactListRow } from "@/lib/contacts-loader.types";
export type { ContactsLoaderData, ContactsPagination, ContactListRow } from "@/lib/contacts-loader.types";

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

    const pageParam = url.searchParams.get("page");
    const page = Math.max(1, parseInt(pageParam || "1", 10));

    const tdb = createTenantDb(workspaceId);

    const [
      userRoleResult,
      workspace,
      campaigns,
      contactsResult,
    ] = await Promise.all([
      getUserRole({ user, workspaceId }),
      getWorkspaceById(workspaceId),
      tdb.campaign.findMany({
        columns: { id: true, title: true, status: true },
        orderBy: (campaign, { desc: descFn }) => [descFn(campaign.created_at)],
      }),
      listWorkspaceContactsApi(supabaseClient, workspaceId, url.searchParams),
    ]);

    const userRole = userRoleResult?.role || null;
    const flags = workspace ? { feature_flags: workspace.feature_flags } : null;

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

    if (!workspace) {
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

    if (!contactsResult.ok) {
      logger.error("Failed to load contacts:", contactsResult.error);
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

    if (flags == null) {
      logger.error("Database errors: workspace feature_flags missing");
    }

    const { contacts, pagination, search_query: searchQuery } = contactsResult;
    const totalPages = pagination.total_pages;
    const totalCountValue = pagination.total_count;

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
        contacts,
        workspace,
        error: null,
        userRole,
        flags,
        campaigns,
        pagination: {
          currentPage: pagination.page,
          totalPages,
          totalCount: totalCountValue,
          pageSize: pagination.page_size,
        },
        searchQuery: searchQuery ?? "",
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
