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
import { useState, useMemo } from "react";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { DataTable } from "@/components/workspace/WorkspaceTable/DataTable";
import TablePagination from "@/components/shared/TablePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUserRole } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { User } from "@/lib/types";
import { formatDateToLocale } from "@/lib/utils";

const ITEMS_PER_PAGE = 20;
const MAX_PAGE_SIZE = 100;

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { supabaseClient, headers, user } = await verifyAuth(request);
    const url = new URL(request.url);
    
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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
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
    const [
      userRoleResult,
      workspaceResult,
      flagsResult,
      countResult,
      contactsResult
    ] = await Promise.all([
      getUserRole({ supabaseClient, user: user as unknown as User, workspaceId }),
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
      supabaseClient
        .from("contact")
        .select("*", { count: "exact", head: true })
        .eq("workspace", workspaceId),
      supabaseClient
        .from("contact")
        .select("id, firstname, surname, phone, email, address, city, other_data, created_at")
        .eq("workspace", workspaceId)
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order("created_at", { ascending: false })
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
      console.error("Database errors:", errors);
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

    return json({ 
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
    }, { headers });

  } catch (error) {
    console.error("Unexpected error in contacts loader:", error);
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
  const [searchTerm, setSearchTerm] = useState("");

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    setSearchParams(params);
  };

  // Filter contacts based on search term (client-side filtering)
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    
    if (!searchTerm) return contacts;
    
    const searchLower = searchTerm.toLowerCase();
    return contacts.filter(contact => {
      return (
        (contact.firstname?.toLowerCase().includes(searchLower) || false) ||
        (contact.surname?.toLowerCase().includes(searchLower) || false) ||
        (contact.email?.toLowerCase().includes(searchLower) || false) ||
        (contact.phone?.toLowerCase().includes(searchLower) || false) ||
        (contact.address?.toLowerCase().includes(searchLower) || false) ||
        (contact.city?.toLowerCase().includes(searchLower) || false)
      );
    });
  }, [contacts, searchTerm]);

  const isWorkspaceEmpty = !contacts?.length;
  const isSearchEmpty = filteredContacts.length === 0 && searchTerm;
  
  return (
    <main className="mx-auto flex h-full w-[80%] flex-col gap-4 rounded-sm text-white py-8">
      {workspace && (
        <WorkspaceNav
          workspace={workspace}
          userRole={userRole}
        />
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {workspace != null
            ? `${workspace?.name} Contacts`
            : "No Workspace"}
        </h1>
        <div className="flex items-center gap-4">
          <Button asChild className="font-Zilla-Slab text-xl font-semibold">
            <Link to={`./new`}>Add Contact</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-0 border-black bg-zinc-600 font-Zilla-Slab text-xl font-semibold text-white hover:bg-zinc-300 dark:border-white"
          >
            <Link to=".." relative="path">
              Back
            </Link>
          </Button>
        </div>
      </div>
      
      {/* Search Bar */}
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 text-black dark:text-white bg-white dark:bg-gray-800"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setSearchTerm("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        {/* Search Results Info */}
        {searchTerm && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {filteredContacts.length} of {contacts?.length || 0} contacts
          </div>
        )}
      </div>
      
      {/* Pagination Info */}
      {pagination.totalCount > 0 && !searchTerm && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing {((pagination.currentPage - 1) * pagination.pageSize) + 1} to{" "}
          {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)} of{" "}
          {pagination.totalCount} contacts
        </div>
      )}

      {error && !isWorkspaceEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}
      {isWorkspaceEmpty && (
        <h4 className="py-16 text-center font-Zilla-Slab text-4xl font-bold text-black dark:text-white">
          Add Your Own Contacts to this Workspace!
        </h4>
      )}
      {isSearchEmpty && (
        <h4 className="py-16 text-center font-Zilla-Slab text-2xl font-bold text-black dark:text-white">
          No contacts found matching "{searchTerm}"
        </h4>
      )}

      {filteredContacts.length > 0 && (
        <>
          <DataTable
            className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
            data={filteredContacts}
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
                  if (!otherData || !Array.isArray(otherData) || otherData.length === 0) {
                    return <div className="text-gray-400">-</div>;
                  }
                  
                  // Debug: Log the structure to understand the format
                  console.log('other_data structure:', otherData);
                  
                  // Show first 2 items, then indicate if there are more
                  const validItems = otherData.filter((item): item is NonNullable<typeof item> => item !== null && item !== undefined);
                  const displayItems = validItems.slice(0, 2);
                  const hasMore = validItems.length > 2;
                  
                  type OtherDataItem = { key: string; value: unknown } | Record<string, unknown> | string | number | boolean;
                  
                  const formatOtherData = (data: unknown[]) => {
                    return data.filter((item): item is OtherDataItem => {
                      if (item === null || item === undefined) return false;
                      return typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || typeof item === 'object';
                    }).map((item: OtherDataItem, i: number) => {
                      let key: string | undefined, value: unknown;
                      
                      // Debug: Log each item to understand its structure
                      console.log('Processing item:', item, 'Type:', typeof item);
                      
                      // Try to extract key and value based on common patterns
                      if (typeof item === 'object' && item !== null) {
                        // Check if it has explicit key/value properties
                        if ('key' in item && typeof item.key === 'string' && 'value' in item) {
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
                      // Handle string format like "key:value"
                      else if (typeof item === 'string') {
                        if (item.includes(':')) {
                          const parts = item.split(':');
                          key = parts[0]?.trim();
                          value = parts.slice(1).join(':').trim();
                        } else {
                          key = item;
                          value = '';
                        }
                      }
                      
                      if (!key) {
                        console.warn('Could not extract key from item:', item);
                        return null;
                      }
                      
                      return (
                        <div key={`${row.original.id}-other-data-${i}`} className="text-xs">
                          <span className="font-medium text-gray-600 dark:text-gray-300">
                            {key}:
                          </span>{" "}
                          <span className="text-gray-800 dark:text-gray-200">
                            {value !== undefined && value !== null ? String(value) : ''}
                          </span>
                        </div>
                      );
                    });
                  };
                  
                  return (
                    <div className="group relative">
                      <div className="space-y-1">
                        {formatOtherData(displayItems as unknown[])}
                        {hasMore && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            +{otherData.length - 2} more
                          </div>
                        )}
                      </div>
                      
                      {/* Tooltip for all data */}
                      {hasMore && (
                        <div className="absolute left-0 top-full z-50 hidden group-hover:block bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 min-w-64 max-w-80">
                          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            All Additional Data:
                          </div>
                          <div className="space-y-1">
                            {formatOtherData(otherData as unknown[])}
                          </div>
                          {/* Debug: Show raw data structure */}
                          <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                            <div className="text-xs text-gray-500 dark:text-gray-400">
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
          
          {/* Pagination - Only show when not searching */}
          {!searchTerm && pagination.totalPages > 1 && (
            <div className="flex justify-center mt-4 mb-8">
              <TablePagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
