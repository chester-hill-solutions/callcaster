import { Link, NavLink, useLoaderData, useSearchParams } from "react-router";
import { MdEdit } from "react-icons/md";
import { Search, X } from "lucide-react";

import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { workspacePanelHeightLgClass } from "@/components/workspace/workspace-panel-classes";
import { DataTable } from "@/components/workspace/tables/DataTable";
import TablePagination from "@/components/shared/TablePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContactsLoaderData } from "@/lib/contacts-loader.types";
import { formatDateToLocale } from "@/lib/utils";

type OtherDataItem =
  | { key: string; value: unknown }
  | Record<string, unknown>
  | string
  | number
  | boolean;

function formatOtherData(data: unknown[]) {
  return data
    .filter((item): item is OtherDataItem => {
      if (item === null || item === undefined) return false;
      return (
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean" ||
        typeof item === "object"
      );
    })
    .map((item: OtherDataItem) => {
      let key: string | undefined;
      let value: unknown;

      if (typeof item === "object" && item !== null) {
        if (
          "key" in item &&
          typeof item.key === "string" &&
          "value" in item
        ) {
          key = item.key;
          value = item.value;
        } else {
          const keys = Object.keys(item);
          const values = Object.values(item);
          if (keys.length === 1) {
            key = keys[0];
            value = values[0];
          }
        }
      }
      return key ? `${key}: ${String(value)}` : String(item);
    })
    .join(", ");
}

export default function ContactsPage() {
  const { contacts, error, userRole, workspace, pagination, campaigns } =
    useLoaderData<ContactsLoaderData>();
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {workspace && userRole && (
          <WorkspaceNav
            workspace={workspace}
            campaigns={campaigns}
            userRole={userRole}
          />
        )}
        <div
          className={`min-w-0 flex-1 rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm sm:p-6 ${workspacePanelHeightLgClass} lg:overflow-y-auto`}
        >
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

            {searchTerm && (
              <div className="text-sm text-muted-foreground">
                {contacts?.length || 0} of {pagination.totalCount} contacts
              </div>
            )}
          </div>

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

                      const validItems = otherData.filter(
                        (item): item is NonNullable<typeof item> =>
                          item !== null && item !== undefined,
                      );
                      const displayItems = validItems.slice(0, 2);
                      const hasMore = validItems.length > 2;

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

                          {hasMore && (
                            <div className="absolute left-0 top-full z-50 hidden min-w-64 max-w-80 rounded-lg border border-border bg-popover p-3 shadow-lg group-hover:block">
                              <div className="mb-2 text-xs font-semibold text-foreground">
                                All Additional Data:
                              </div>
                              <div className="space-y-1">
                                {formatOtherData(otherData as unknown[])}
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
