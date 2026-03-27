import { LoaderFunctionArgs } from "@remix-run/node";
import {
  Link,
  NavLink,
  json,
  useLoaderData,
  useSearchParams,
} from "@remix-run/react";
import { MdEdit } from "react-icons/md";
import { Search, X } from "lucide-react";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { DataTable } from "@/components/workspace/tables/DataTable";
import TablePagination from "@/components/shared/TablePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUserRole } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { User } from "@/lib/types";
import { formatDateToLocale } from "@/lib/utils";
import { logger } from "@/lib/logger.server";

const ITEMS_PER_PAGE = 20;
const MAX_PAGE_SIZE = 100;
const SHORT_QUERY_MAX_LENGTH = 2;
const PHONE_SUBSTRING_MIN_LENGTH = 4;

function escapeIlikeTerm(raw: string): string {
  return raw
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll(",", " ")
    .trim();
}

function buildContactSearchFilter(rawSearchQuery: string): string {
  const escapedQuery = escapeIlikeTerm(rawSearchQuery);
  if (!escapedQuery) {
    return "";
  }

  const isShortQuery = escapedQuery.length <= SHORT_QUERY_MAX_LENGTH;
  const textSearchPattern = isShortQuery
    ? `${escapedQuery}%`
    : `%${escapedQuery}%`;
  const normalizedDigits = rawSearchQuery.replace(/\D/g, "");
  const escapedDigits = escapeIlikeTerm(normalizedDigits);
  const filters = [
    `firstname.ilike.${textSearchPattern}`,
    `surname.ilike.${textSearchPattern}`,
    `email.ilike.${textSearchPattern}`,
    `address.ilike.${textSearchPattern}`,
    `city.ilike.${textSearchPattern}`,
  ];

  if (normalizedDigits.length >= PHONE_SUBSTRING_MIN_LENGTH && escapedDigits) {
    filters.push(
      `phone.eq.${escapedDigits}`,
      `phone.ilike.${escapedDigits}%`,
      `phone.ilike.%${escapedDigits}%`,
    );
  } else {
    filters.push(`phone.ilike.${textSearchPattern}`);
  }

  return filters.join(",");
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { supabaseClient, headers, user } = await verifyAuth(request);
    const url = new URL(request.url);
    const rawSearchQuery = url.searchParams.get("q") ?? "";
    const searchQuery = rawSearchQuery.trim().replaceAll(",", " ");

    // Validate and parse pagination parameters
    const pageParam = url.searchParams.get("page");
    const page = Math.max(1, parseInt(pageParam || "1"));
    const pageSize = Math.min(ITEMS_PER_PAGE, MAX_PAGE_SIZE);

    const workspaceId = params.id;
    if (!workspaceId) {
      return json(
        {
          contacts: null,
          workspace: null,
          error: "Workspace ID is required",
          userRole: null,
          flags: null,
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalCount: 0,
            pageSize,
          },
        },
        { headers, status: 400 },
      );
    }

    // Validate workspace ID format (assuming UUID format)
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        workspaceId,
      )
    ) {
      return json(
        {
          contacts: null,
          workspace: null,
          error: "Invalid workspace ID format",
          userRole: null,
          flags: null,
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalCount: 0,
            pageSize,
          },
        },
        { headers, status: 400 },
      );
    }

    // Parallel database queries for better performance
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
    ]);

    // Extract data and handle errors
    const userRole = userRoleResult?.role || null;
    const { data: workspace, error: workspaceError } = workspaceResult;
    const { data: flags, error: flagsError } = flagsResult;
    const { count: totalCount, error: countError } = countResult;
    const { data: contacts, error: contactError } = contactsResult;

    // Check for workspace access
    if (!userRole) {
      return json(
        {
          contacts: null,
          workspace: null,
          error: "You don't have access to this workspace",
          userRole: null,
          flags: null,
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalCount: 0,
            pageSize,
          },
        },
        { headers, status: 403 },
      );
    }

    // Check if workspace exists
    if (workspaceError || !workspace) {
      return json(
        {
          contacts: null,
          workspace: null,
          error: "Workspace not found",
          userRole,
          flags: null,
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalCount: 0,
            pageSize,
          },
        },
        { headers, status: 404 },
      );
    }

    // Handle database errors
    const errors = [contactError, countError, flagsError].filter(Boolean);
    if (errors.length > 0) {
      logger.error("Database errors:", errors);
      return json(
        {
          contacts: null,
          workspace,
          error: "Failed to load contacts. Please try again.",
          userRole,
          flags: null,
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalCount: 0,
            pageSize,
          },
        },
        { headers, status: 500 },
      );
    }

    const totalCountValue = totalCount || 0;
    const totalPages = Math.ceil(totalCountValue / pageSize);

    // Validate page number
    if (page > totalPages && totalPages > 0) {
      return json(
        {
          contacts: null,
          workspace,
          error: `Page ${page} does not exist. Total pages: ${totalPages}`,
          userRole,
          flags,
          pagination: {
            currentPage: 1,
            totalPages,
            totalCount: totalCountValue,
            pageSize,
          },
        },
        { headers, status: 400 },
      );
    }

    return json(
      {
        contacts: contacts || [],
        workspace,
        error: null,
        userRole,
        flags,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount: totalCountValue,
          pageSize,
        },
        searchQuery,
      },
      { headers },
    );
  } catch (error) {
    logger.error("Unexpected error in contacts loader:", error);
    return json(
      {
        contacts: null,
        workspace: null,
        error: "An unexpected error occurred. Please try again.",
        userRole: null,
        flags: null,
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalCount: 0,
          pageSize: ITEMS_PER_PAGE,
        },
      },
      { status: 500 },
    );
  }
}

export default function WorkspaceContacts() {
  const { contacts, error, userRole, workspace, flags, pagination } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get("q") ?? "";

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    setSearchParams(params);
  };

  const handleSearchChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    const trimmedValue = value.trim();
    if (trimmedValue) {
      params.set("q", trimmedValue);
    } else {
      params.delete("q");
    }
    params.set("page", "1");
    setSearchParams(params);
  };

  const isWorkspaceEmpty = !contacts?.length;
  const isSearchEmpty = (contacts?.length ?? 0) === 0 && searchTerm;

  return (
    <main className="mx-auto flex h-full w-full max-w-[1500px] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {workspace && (
          <WorkspaceNav workspace={workspace} userRole={userRole} />
        )}
        <div className="min-w-0 flex-1 rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary">
              {workspace != null
                ? `${workspace?.name} Contacts`
                : "No Workspace"}
            </h1>
            <div className="flex items-center gap-4">
              <Button
                asChild
                className="font-Zilla-Slab text-base font-semibold"
              >
                <Link to={`./new`}>Add Contact</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="font-Zilla-Slab text-base font-semibold"
              >
                <Link to=".." relative="path">
                  Back
                </Link>
              </Button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="relative w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="bg-background pl-8 text-foreground"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full hover:bg-muted"
                  onClick={() => handleSearchChange("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Search Results Info */}
            {searchTerm && (
              <div className="text-sm text-muted-foreground">
                {contacts?.length || 0} of {pagination.totalCount} contacts
              </div>
            )}
          </div>

          {/* Pagination Info */}
          {pagination.totalCount > 0 && !searchTerm && (
            <div className="text-sm text-muted-foreground">
              Showing {(pagination.currentPage - 1) * pagination.pageSize + 1}{" "}
              to{" "}
              {Math.min(
                pagination.currentPage * pagination.pageSize,
                pagination.totalCount,
              )}{" "}
              of {pagination.totalCount} contacts
            </div>
          )}

          {error && !isWorkspaceEmpty && (
            <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
              {error}
            </h4>
          )}
          {isWorkspaceEmpty && (
            <h4 className="py-16 text-center font-Zilla-Slab text-4xl font-bold text-foreground">
              Add Your Own Contacts to this Workspace!
            </h4>
          )}
          {isSearchEmpty && (
            <h4 className="py-16 text-center font-Zilla-Slab text-2xl font-bold text-foreground">
              No contacts found matching "{searchTerm}"
            </h4>
          )}

          {(contacts?.length ?? 0) > 0 && (
            <>
              <DataTable
                className="rounded-md border-2 border-border font-semibold text-foreground"
                data={contacts ?? []}
                columns={[
                  {
                    accessorKey: "firstname",
                    header: "First",
                  },
                  {
                    accessorKey: "surname",
                    header: "Last",
                  },
                  {
                    accessorKey: "phone",
                    header: "Phone Number",
                  },
                  {
                    accessorKey: "email",
                    header: "Email Address",
                  },
                  {
                    accessorKey: "address",
                    header: "Street Address",
                  },
                  {
                    accessorKey: "city",
                    header: "City",
                  },
                  {
                    header: "Other Data",
                    cell: ({ row }) => {
                      const otherData = row.original.other_data;
                      if (
                        !otherData ||
                        !Array.isArray(otherData) ||
                        otherData.length === 0
                      ) {
                        return <div className="text-muted-foreground">-</div>;
                      }

                      // Show first 2 items, then indicate if there are more
                      const validItems = otherData.filter(
                        (item): item is NonNullable<typeof item> =>
                          item !== null && item !== undefined,
                      );
                      const displayItems = validItems.slice(0, 2);
                      const hasMore = validItems.length > 2;

                      type OtherDataItem =
                        | { key: string; value: unknown }
                        | Record<string, unknown>
                        | string
                        | number
                        | boolean;

                      const formatOtherData = (data: unknown[]) => {
                        return data
                          .filter((item): item is OtherDataItem => {
                            if (item === null || item === undefined)
                              return false;
                            return (
                              typeof item === "string" ||
                              typeof item === "number" ||
                              typeof item === "boolean" ||
                              typeof item === "object"
                            );
                          })
                          .map((item: OtherDataItem) => {
                            let key: string | undefined, value: unknown;

                            // Try to extract key and value based on common patterns
                            if (typeof item === "object" && item !== null) {
                              // Check if it has explicit key/value properties
                              if (
                                "key" in item &&
                                typeof item.key === "string" &&
                                "value" in item
                              ) {
                                key = item.key;
                                value = item.value;
                              }
                              // Check if it's a simple object with one key-value pair
                              else {
                                const keys = Object.keys(item);
                                const values = Object.values(item);
                                if (keys.length === 1) {
                                  key = keys[0];
                                  value = values[0];
                                }
                              }
                            }
                            return key
                              ? `${key}: ${String(value)}`
                              : String(item);
                          })
                          .join(", ");
                      };

                      return (
                        <div className="group relative">
                          <div className="space-y-1">
                            {formatOtherData(displayItems as unknown[])}
                            {hasMore && (
                              <div className="text-xs font-medium text-primary">
                                +{otherData.length - 2} more
                              </div>
                            )}
                          </div>

                          {/* Tooltip for all data */}
                          {hasMore && (
                            <div className="absolute left-0 top-full z-50 hidden min-w-64 max-w-80 rounded-lg border border-border bg-popover p-3 shadow-lg group-hover:block">
                              <div className="mb-2 text-xs font-semibold text-foreground">
                                All Additional Data:
                              </div>
                              <div className="space-y-1">
                                {formatOtherData(otherData as unknown[])}
                              </div>
                              {/* Debug: Show raw data structure */}
                              <div className="mt-2 border-t border-border pt-2">
                                <div className="text-xs text-muted-foreground">
                                  Raw data: {JSON.stringify(otherData)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    accessorKey: "created_at",
                    header: "Created",
                    cell: ({ row }) => {
                      const formatted = formatDateToLocale(
                        row.getValue("created_at"),
                      );
                      return <div className="">{formatted.split(",")[0]}</div>;
                    },
                  },
                  {
                    header: "Edit",
                    cell: ({ row }) => {
                      const id = row.original.id;
                      return (
                        <Button variant="ghost" asChild>
                          <NavLink to={`./${id}`} relative="path">
                            <MdEdit />
                          </NavLink>
                        </Button>
                      );
                    },
                  },
                ]}
              />

              {pagination.totalPages > 1 && (
                <div className="mb-8 mt-4 flex justify-center">
                  <TablePagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
