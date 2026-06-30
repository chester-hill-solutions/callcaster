import { data as routeData } from "react-router";
import { getAudienceDetailApi } from "@/lib/platform-data.server";
import { requireWorkspaceLoaderContext } from "@/lib/workspace-route.server";
import type { AudienceDetailLoaderData } from "./$audience_id.types";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const result = await requireWorkspaceLoaderContext(request, params.id);
  if (!result.ok) return result.response;
  const { supabaseClient, headers, workspaceId: workspace_id } = result.ctx;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") || "50", 10);
  const sortKey = url.searchParams.get("sortKey") || "id";
  const sortDirection = url.searchParams.get("sortDirection") === "desc" ? "desc" : "asc";

  const audience_id = params.audience_id;

  if (!audience_id) {
    return routeData<AudienceDetailLoaderData>(
      {
        contacts: null,
        workspace_id,
        audience: null,
        audience_id,
        error: "Audience ID is required",
        pagination: {
          currentPage: page,
          pageSize,
          totalCount: null,
        },
        sorting: {
          sortKey,
          sortDirection,
        },
      },
      { headers },
    );
  }

  const apiSearchParams = new URLSearchParams();
  apiSearchParams.set("page", String(page));
  apiSearchParams.set("page_size", String(pageSize));
  apiSearchParams.set("sort_key", sortKey);
  apiSearchParams.set("sort_direction", sortDirection);

  const detailResult = await getAudienceDetailApi(
    supabaseClient,
    workspace_id,
    audience_id,
    apiSearchParams,
  );

  if (!detailResult.ok) {
    return routeData<AudienceDetailLoaderData>(
      {
        contacts: null,
        workspace_id,
        audience: null,
        audience_id,
        error: detailResult.error,
        pagination: {
          currentPage: page,
          pageSize,
          totalCount: null,
        },
        sorting: {
          sortKey,
          sortDirection,
        },
        latestUpload: null,
      },
      { headers, status: detailResult.status },
    );
  }

  return routeData<AudienceDetailLoaderData>(
    {
      contacts: detailResult.contacts,
      workspace_id,
      audience: detailResult.audience,
      audience_id,
      error: null,
      pagination: {
        currentPage: detailResult.pagination.page,
        pageSize: detailResult.pagination.page_size,
        totalCount: detailResult.pagination.total_count,
      },
      sorting: {
        sortKey: detailResult.sorting.sort_key,
        sortDirection: detailResult.sorting.sort_direction,
      },
      latestUpload: detailResult.latest_upload
        ? {
            id: detailResult.latest_upload.id,
            status: detailResult.latest_upload.status,
            progress: detailResult.latest_upload.progress,
            total_contacts: detailResult.latest_upload.total_contacts,
            processed_contacts: detailResult.latest_upload.processed_contacts,
            error_message: detailResult.latest_upload.error_message,
          }
        : null,
    },
    { headers },
  );
}
