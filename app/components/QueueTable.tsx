import { Audience, Contact, QueueItem } from "~/lib/types";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Button } from "./ui/button";
import { useSearchParams, useNavigation, Form, useSubmit, useFetcher } from "@remix-run/react";
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    ColumnDef,
    flexRender,
    RowSelectionState,
    SortingState,
} from "@tanstack/react-table";
import { Checkbox } from "./ui/checkbox";
import { ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react";
import { Input } from "./ui/input";
import { StatusDropdown } from "./queue/StatusDropdown";
import { QueueTablePagination } from "./queue/QueueTablePagination";

const STATUS_OPTIONS = ["queued", "dequeued"] as const;
const ATTEMPT_OPTIONS = ["completed", "failed", "no-answer", "voicemail", "unknown"] as const;
interface QueueTableProps {
    queue: QueueItem[] | null;
    totalCount: number | null;
    unfilteredCount: number | null;
    currentPage: number;
    pageSize: number;
    audiences: Audience[];
    defaultFilters: {
        name: string;
        phone: string;
        email: string;
        address: string;
        audiences: string;
        status: string;
    };
    handleFilterChange: (key: string, value: string) => void;
    clearFilter: () => void;
    onStatusChange?: (selectedIds: string[], status: typeof STATUS_OPTIONS[number]) => void;
    onSelectAllFiltered: (isSelected: boolean) => void;
    isAllFilteredSelected: boolean;
    addContactToQueue: (contact: (Contact & { contact_audience: { audience_id: number }[] })[]) => void;
    removeContactsFromQueue: (ids: string[] | 'all') => void;
}

export function QueueTable({
    unfilteredCount,
    queue = [],
    totalCount,
    currentPage,
    audiences,
    pageSize,
    defaultFilters,
    onStatusChange,
    onSelectAllFiltered,
    isAllFilteredSelected,
    handleFilterChange,
    clearFilter,
    addContactToQueue,
    removeContactsFromQueue,
}: QueueTableProps) {
    const navigation = useNavigation();
    const fetcher = useFetcher();
    const isLoading = navigation.state === "loading";
    const isFiltered = defaultFilters.name !== '' || defaultFilters.phone !== '' || defaultFilters.status !== '' || defaultFilters.audiences !== '' || defaultFilters.address !== '' || defaultFilters.email !== '';
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [sorting, setSorting] = useState<SortingState>([]);
    // Optimistic state for queue items
    const [optimisticQueue, setOptimisticQueue] = useState(queue);

    // Add these state hooks at the top of your component
    const [optimisticStatus, setOptimisticStatus] = useState(defaultFilters.status || "");
    const [optimisticAudience, setOptimisticAudience] = useState(defaultFilters.audiences || "");
    const [optimisticInputs, setOptimisticInputs] = useState({
        name: defaultFilters.name || "",
        phone: defaultFilters.phone || "",
        email: defaultFilters.email || "",
        address: defaultFilters.address || ""
    });

    useEffect(() => {
        setOptimisticQueue(queue);
    }, [queue]);

    useEffect(() => {
        setOptimisticInputs({
            name: defaultFilters.name || "",
            phone: defaultFilters.phone || "",
            email: defaultFilters.email || "",
            address: defaultFilters.address || ""
        });
    }, [defaultFilters]);

    const selectAllVisible = useCallback(() => {
        const newSelection: RowSelectionState = {};
        optimisticQueue?.forEach((item) => {
            newSelection[item.id] = true;
        });
        setRowSelection(newSelection);
    }, [optimisticQueue]);

    const clearSelection = useCallback(() => {
        onSelectAllFiltered(false);
        setRowSelection({});
    }, [onSelectAllFiltered]);

    const totalPages = Math.ceil((totalCount || 0) / pageSize);

    const getVisiblePages = useCallback(() => {
        const delta = 2;
        const range: (number | 'ellipsis')[] = [];

        for (let i = 1; i <= totalPages; i++) {
            if (
                i === 1 ||
                i === totalPages ||
                (i >= currentPage - delta && i <= currentPage + delta)
            ) {
                range.push(i);
            } else if (i === currentPage - delta - 1 || i === currentPage + delta + 1) {
                range.push('ellipsis');
            }
        }

        return range;
    }, [currentPage, totalPages]);

    const selectAllFiltered = useCallback(() => {
        onSelectAllFiltered(true);
        const newSelection: RowSelectionState = {};
        optimisticQueue?.forEach((item) => {
            newSelection[item.id] = true;
        });
        setRowSelection(newSelection);
    }, [optimisticQueue, onSelectAllFiltered]);

    // Optimistic update handlers
    const handleStatusChangeOptimistic = useCallback((selectedIds: string[], newStatus: typeof STATUS_OPTIONS[number]) => {
        setOptimisticQueue(prev =>
            prev?.map(item =>
                selectedIds.includes(item.id.toString())
                    ? { ...item, status: newStatus }
                    : item
            ) || []
        );
        onStatusChange?.(selectedIds, newStatus);
    }, [onStatusChange]);

    const handleRemoveContactsOptimistic = useCallback((ids: string[] | 'all') => {
        if (ids === 'all') {
            setOptimisticQueue([]);
        } else {
            setOptimisticQueue(prev =>
                prev?.filter(item => !ids.includes(item.id.toString())) || []
            );
        }
        removeContactsFromQueue(ids);
        clearSelection();
    }, [removeContactsFromQueue, clearSelection]);

    const columns = useMemo<ColumnDef<QueueItem & { contact: Contact }>[]>(() => [
        {
            id: 'select',
            size: 20,
            header: ({ table }) => (
                <div className="px-0.5">
                    <Checkbox
                        checked={isAllFilteredSelected || table.getIsAllPageRowsSelected()}
                        onCheckedChange={(value) => {
                            table.toggleAllRowsSelected(!!value);
                            if (!value) {
                                onSelectAllFiltered(false);
                            }
                        }}
                        aria-label="Select all"
                        className="h-3 w-3"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="px-0.5">
                    <Checkbox
                        checked={isAllFilteredSelected || row.getIsSelected()}
                        onCheckedChange={(value) => {
                            row.toggleSelected(!!value);
                            if (!value) {
                                onSelectAllFiltered(false);
                            }
                        }}
                        aria-label="Select row"
                        className="h-3 w-3"
                    />
                </div>
            ),
        },
        {
            accessorFn: (row) => `${row.contact?.firstname || ''} ${row.contact?.surname || ''}`.trim() || '-',
            id: 'name',
            header: ({ column }) => (
                <div className="space-y-1">
                    <div className="flex items-center px-1 justify-between">
                        <span className="font-medium text-xs">Name</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                column.toggleSorting();
                                const sort = column.getIsSorted();
                                handleFilterChange('sort', sort ? `name.${sort}` : '');
                            }}
                            className="h-6 px-1"
                        >
                            {column.getIsSorted() === "asc" ? (
                                <ChevronUp className="h-3 w-3" />
                            ) : column.getIsSorted() === "desc" ? (
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronUp className="h-3 w-3 opacity-30" />
                            )}
                        </Button>
                    </div>
                    <div className="relative">
                        <Input
                            name="name"
                            placeholder="Filter names..."
                            value={optimisticInputs.name}
                            onChange={(e) => handleFilterChange('name', e.target.value)}
                            className="h-6 w-full bg-white/50 text-xs"
                        />
                    </div>
                </div>
            ),
        },
        {
            accessorFn: (row) => row.contact?.phone || '-',
            id: 'phone',
            header: ({ column }) => (
                <div className="space-y-1">
                    <div className="flex items-center px-1 justify-between">
                        <span className="font-medium text-xs">Phone</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                column.toggleSorting();
                                const sort = column.getIsSorted();
                                handleFilterChange('sort', sort ? `phone.${sort}` : '');
                            }}
                            className="h-6 px-1"
                        >
                            {column.getIsSorted() === "asc" ? (
                                <ChevronUp className="h-3 w-3" />
                            ) : column.getIsSorted() === "desc" ? (
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronUp className="h-3 w-3 opacity-30" />
                            )}
                        </Button>
                    </div>
                    <div className="relative">
                        <Input
                            name="phone"
                            placeholder="Filter phone..."
                            value={optimisticInputs.phone}
                            onChange={(e) => handleFilterChange('phone', e.target.value)}
                            className="h-6 w-full bg-white/50 text-xs"
                        />
                    </div>
                </div>
            ),
        },
        {
            accessorFn: (row) => row.contact?.email || '-',
            id: 'email',
            header: ({ column }) => (
                <div className="space-y-1">
                    <div className="flex items-center px-1 justify-between">
                        <span className="font-medium text-xs">Email</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                column.toggleSorting();
                                const sort = column.getIsSorted();
                                handleFilterChange('sort', sort ? `email.${sort}` : '');
                            }}
                            className="h-6 px-1"
                        >
                            {column.getIsSorted() === "asc" ? (
                                <ChevronUp className="h-3 w-3" />
                            ) : column.getIsSorted() === "desc" ? (
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronUp className="h-3 w-3 opacity-30" />
                            )}
                        </Button>
                    </div>
                    <div className="relative">
                        <Input
                            name="email"
                            placeholder="Filter email..."
                            value={optimisticInputs.email}
                            onChange={(e) => handleFilterChange('email', e.target.value)}
                            className="h-6 w-full bg-white/50 text-xs"
                        />
                    </div>
                </div>
            ),
        },
        {
            accessorFn: (row) => row.contact?.address || '-',
            id: 'address',
            header: ({ column }) => (
                <div className="space-y-1">
                    <div className="flex items-center px-1 justify-between">
                        <span className="font-medium text-xs">Address</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                column.toggleSorting();
                                const sort = column.getIsSorted();
                                handleFilterChange('sort', sort ? `address.${sort}` : '');
                            }}
                            className="h-6 px-1"
                        >
                            {column.getIsSorted() === "asc" ? (
                                <ChevronUp className="h-3 w-3" />
                            ) : column.getIsSorted() === "desc" ? (
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronUp className="h-3 w-3 opacity-30" />
                            )}
                        </Button>
                    </div>
                    <div className="relative">
                        <Input
                            name="address"
                            placeholder="Filter address..."
                            defaultValue={defaultFilters.address}
                            onChange={(e) => handleFilterChange('address', e.target.value)}
                            className="h-6 w-full bg-white/50 text-xs"
                        />
                    </div>
                </div>
            ),
        },
        {
            accessorFn: (row) => row.contact?.audiences?.map(a => a.name).join(', ') || '-',
            id: 'audiences',
            header: ({ column }) => (
                <div className="space-y-1">
                    <div className="flex items-center px-1 justify-between">
                        <span className="font-medium text-xs">Audiences</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                column.toggleSorting();
                                const sort = column.getIsSorted();
                                handleFilterChange('sort', sort ? `audiences.${sort}` : '');
                            }}
                            className="h-6 px-1"
                        >
                            {column.getIsSorted() === "asc" ? (
                                <ChevronUp className="h-3 w-3" />
                            ) : column.getIsSorted() === "desc" ? (
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronUp className="h-3 w-3 opacity-30" />
                            )}
                        </Button>
                    </div>
                    <div className="relative">
                        <select
                            name="audiences"
                            value={optimisticAudience}
                            onChange={(e) => {
                                const newValue = e.target.value;
                                setOptimisticAudience(newValue);
                                handleFilterChange('audiences', newValue);
                            }}
                            className="h-6 w-full rounded border border-input bg-gray-100/50 px-2 text-xs"
                        >
                            <option value="">Select audience...</option>
                            {audiences?.map(audience => (
                                <option key={audience?.id} value={audience?.id?.toString() || ''}>
                                    {audience?.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'status',
            header: ({ column, table }) => {
                const rows = rowSelection;
                const selectedRows = Object.keys(rows).map(String);

                return (
                    <div className="space-y-1">
                        <div className="flex items-center px-1 justify-between">
                            <span className="font-medium text-xs">
                                {selectedRows.length > 0 || isAllFilteredSelected ? "Set Status" : "Status"}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    column.toggleSorting();
                                    const sort = column.getIsSorted();
                                    handleFilterChange('sort', sort ? `status.${sort}` : '');
                                }}
                                className="h-6 px-1"
                            >
                                {column.getIsSorted() === "asc" ? (
                                    <ChevronUp className="h-3 w-3" />
                                ) : column.getIsSorted() === "desc" ? (
                                    <ChevronDown className="h-3 w-3" />
                                ) : (
                                    <ChevronUp className="h-3 w-3 opacity-30" />
                                )}
                            </Button>
                        </div>
                        <select
                            name="status"
                            value={selectedRows.length > 0 ? "" : optimisticStatus}
                            onChange={(e) => {
                                const newValue = e.target.value;
                                if (selectedRows.length > 0 || isAllFilteredSelected) {
                                    handleStatusChangeOptimistic(selectedRows, newValue as typeof STATUS_OPTIONS[number]);
                                } else {
                                    setOptimisticStatus(newValue);
                                    handleFilterChange('status', newValue);
                                }
                            }}
                            className="h-6 w-full rounded border border-input bg-gray-100/50 px-2 text-xs"
                        >
                            {selectedRows.length > 0 || isAllFilteredSelected ? (
                                <>
                                    <option value="">Set status...</option>
                                    {STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </>
                            ) : (
                                <>
                                    <option value="">All statuses</option>
                                    {STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </>
                            )}
                        </select>
                    </div>
                );
            },
            cell: ({ row }) => (
                <StatusDropdown
                    currentStatus={row.original.status}
                    onSelect={(status) => handleStatusChangeOptimistic([row.original.id.toString()], status)}
                />
            ),
        },
        {
            accessorFn: (row) => row.contact?.outreach_attempt[0]?.disposition || '-',
            id: 'status',
            header: ({ column }) => {
                return (
                    <div className="flex flex-col items-center px-1 space-y-1">
                        <div className="space-y-1">
                            <span className="font-medium text-xs">Attempt</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <select name="status" className="h-6 w-full rounded border border-input bg-gray-100/50 px-2 text-xs" defaultValue={defaultFilters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
                                <option value="">Select...</option>
                                {ATTEMPT_OPTIONS.map((attempt) => (
                                    <option key={attempt} value={attempt}>{attempt}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )
            },
            cell: ({ row }) => {
                const disposition: 'completed' | 'failed' | 'no-answer' | 'voicemail' | 'unknown' = row.original.contact?.outreach_attempt[0]?.disposition;
                const badgeClass = disposition === 'completed' ? 'bg-green-500/10 text-green-800' : disposition === 'failed' ? 'bg-red-500/20 text-red-800' : disposition === 'no-answer' ? 'bg-yellow-500/20 text-yellow-800' : disposition === 'voicemail' ? 'bg-blue-500/10 text-blue-800' : 'bg-gray-500/10 text-gray-800';
                return (
                    <span className={`text-center w-full text-[8px] px-2 py-1 rounded-full ${badgeClass}`}>{disposition?.trim().toUpperCase() || '-'}</span   >
                )
            },
        }
    ], [isAllFilteredSelected, onSelectAllFiltered, rowSelection]);

    const table = useReactTable({
        data: optimisticQueue || [],
        columns,
        state: {
            sorting,
            rowSelection,
        },
        enableRowSelection: true,
        enableMultiRowSelection: true,
        onSortingChange: setSorting,
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getRowId: (row) => row.id.toString(),
    });

    return (
        <Form method="get" className="space-y-2 py-2">
            {/* Selection Controls */}
            <div className="flex items-center gap-1 px-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllVisible}
                    className="h-6 text-xs"
                >
                    Select Visible ({optimisticQueue?.length})
                </Button>
                {totalCount && totalCount > pageSize && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={selectAllFiltered}
                        className="h-6 text-xs"
                    >
                        Select All {isFiltered ? `Filtered (${totalCount})` : `(${totalCount})`}
                    </Button>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => clearFilter()}
                    className="h-6 text-xs ml-auto"
                    disabled={!isFiltered}
                >
                    Clear Filters
                </Button>
                {(Object.keys(rowSelection).length > 0 || isAllFilteredSelected) && (
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                            const selectedIds = isAllFilteredSelected
                                ? optimisticQueue?.map(item => item.id.toString()) || []
                                : Object.keys(rowSelection);
                            handleRemoveContactsOptimistic(isAllFilteredSelected ? 'all' : selectedIds);
                        }}
                        className="h-6 text-xs ml-auto"
                    >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete {isAllFilteredSelected ? totalCount : Object.keys(rowSelection).length}
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="rounded-md border">
                <div className="relative">
                    <div className="max-h-[800px] overflow-y-auto">
                        <table className="w-full">
                            <thead className="sticky top-0 bg-gray-100 border-b">
                                {table.getHeaderGroups().map(headerGroup => (
                                    <tr key={headerGroup.id}>
                                        {headerGroup.headers.map(header => (
                                            <th
                                                key={header.id}
                                                className="h-10 px-2 text-left align-middle font-medium text-primary text-xs"
                                                style={{ width: header.getSize() }}
                                            >
                                                {flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                ))}
                            </thead>
                            <tbody>
                                {table.getRowModel().rows.map(row => (
                                    <tr key={row.id} className="border-b hover:bg-muted/50 text-gray-500">
                                        {row.getVisibleCells().map(cell => (
                                            <td key={cell.id} className="p-1 px-2 text-xs">
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                <tr className="sticky bottom-0 bg-gray-100">
                                    <td colSpan={columns.length} className="p-2 text-xs">
                                        {isAllFilteredSelected ?
                                            `Selected: ${totalCount} of ${unfilteredCount}` :
                                            Object.keys(rowSelection).length > 0 ?
                                                `Selected: ${Object.keys(rowSelection).length} of ${unfilteredCount}` :
                                                `Total: ${totalCount} of ${unfilteredCount}`
                                        }
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <QueueTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalCount={totalCount || 0}
                getVisiblePages={getVisiblePages}
                handleFilterChange={handleFilterChange}
            />
        </Form>
    );
}