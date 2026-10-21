import { Link, NavLink, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { MdEdit } from "react-icons/md";
import { Search, Trash2, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { DataTable } from "@/components/workspace/tables/DataTable";
import TablePagination from "@/components/shared/TablePagination";
import { WorkspaceResourceEmptyState } from "@/components/workspace/WorkspaceResourceListShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField, FormFieldControl } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ContactListRow, ContactsLoaderData } from "@/lib/contacts-loader.types";
import { formatDateToLocale } from "@/lib/utils";
import { hasMinRole, MemberRole } from "@/lib/member-role";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const { contacts, error, pagination, userRole } =
    useLoaderData<ContactsLoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [contactToDelete, setContactToDelete] = useState<
    { id: number; name: string } | null
  >(null);
  const deleteFetcher = useFetcher<{
    success?: boolean;
    error?: string;
    contact_id?: number;
  }>({
    key: contactToDelete ? `delete-contact-${contactToDelete.id}` : "delete-contact",
  });
  const searchTerm = searchParams.get("q") ?? "";
  const canDelete = hasMinRole(userRole ?? undefined, MemberRole.Member);
  const isDeleting = deleteFetcher.state !== "idle";
  const deleteSucceeded = deleteFetcher.data?.success === true;

  const deleteContact = () => {
    if (!contactToDelete) return;
    deleteFetcher.submit(
      { intent: "delete_contact", contact_id: String(contactToDelete.id) },
      { method: "post" },
    );
  };

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
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-4">
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

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <FormField
          htmlFor={searchId}
          label="Search contacts"
          className="contents [&>label]:sr-only"
        >
          <div className="contents">
            <div className="relative w-72">
              <Search aria-hidden="true" className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <FormFieldControl>
                <Input
                  id={searchId}
                  ref={searchInputRef}
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="bg-background pl-8 text-foreground"
                />
              </FormFieldControl>
              {searchTerm && (
                <Button
                  aria-label="Clear search"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full hover:bg-muted"
                  onClick={() => {
                    handleSearchChange("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </FormField>

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
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {isWorkspaceEmpty && (
            <WorkspaceResourceEmptyState
              emptyMessage="Add your first contact"
              emptyDescription="Add contacts one at a time or import a CSV into a Call list."
              addAction={
                <Button
                  asChild
                  className="font-Zilla-Slab text-base font-semibold"
                >
                  <Link to={`./new`}>Add Contact</Link>
                </Button>
              }
            />
          )}
      {isSearchEmpty && (
        <WorkspaceResourceEmptyState
          emptyMessage="Try another search"
          emptyDescription={`Contacts matching "${searchTerm}" will appear here.`}
        />
      )}

      {(contacts?.length ?? 0) > 0 && (
        <>
          <DataTable
                className="font-semibold text-foreground"
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
                      const contactName = [row.original.firstname, row.original.surname]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <Button
                          variant="ghost"
                          asChild
                          aria-label={contactName ? `Edit ${contactName}` : "Edit contact"}
                        >
                          <NavLink to={`./${id}`} relative="path">
                            <MdEdit />
                          </NavLink>
                        </Button>
                      );
                    },
                  },
                  ...(canDelete
                    ? [{
                        header: "Delete",
                        cell: ({ row }: { row: { original: ContactListRow } }) => {
                          const contactName = [row.original.firstname, row.original.surname]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <Button
                              variant="ghost"
                              aria-label={contactName ? `Delete ${contactName}` : "Delete contact"}
                              onClick={() =>
                                setContactToDelete({
                                  id: row.original.id,
                                  name: contactName || `contact ${row.original.id}`,
                                })
                              }
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          );
                        },
                      }]
                    : []),
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
      <Dialog
        open={contactToDelete !== null && !deleteSucceeded}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setContactToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {contactToDelete?.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the contact from this workspace.
            </DialogDescription>
          </DialogHeader>
          {deleteFetcher.data?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{deleteFetcher.data.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={deleteContact} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
