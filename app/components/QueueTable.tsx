import { Contact, QueueItem } from "~/lib/types";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Button } from "./ui/button";
import { useSearchParams, useNavigation, useSubmit } from "@remix-run/react";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Input } from "./ui/input";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationEllipsis,
} from "./ui/pagination";
import { Form } from "@remix-run/react";

const STATUS_OPTIONS = ["queued", "dequeued"] as const;

interface QueueTableProps {
    queue: (QueueItem & { contact: Contact })[];
    totalCount: number | null;
    currentPage: number;
    pageSize: number;
    defaultFilters: {
        name: string;
        phone: string;
        status: string;
    };
    onStatusChange?: (selectedIds: string[], status: typeof STATUS_OPTIONS[number]) => void;
    onSelectAllFiltered: (isSelected: boolean) => void;
    isAllFilteredSelected: boolean;
}

export function QueueTable({
    queue = [],
    totalCount,
    currentPage,
    pageSize,
    defaultFilters,
    onStatusChange,
    onSelectAllFiltered,
    isAllFilteredSelected,
}: QueueTableProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigation = useNavigation();
    const submit = useSubmit();
    const isLoading = navigation.state === "loading";

    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [sorting, setSorting] = useState<SortingState>([]);

    const selectAllVisible = useCallback(() => {
        const newSelection: RowSelectionState = {};
        queue.forEach((item) => {
            newSelection[item.id] = true;
        });
        setRowSelection(newSelection);


    }, [queue, onSelectAllFiltered]);
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
        queue.forEach((item) => {
            newSelection[item.id] = true;
        });
        setRowSelection(newSelection);
    }, [queue, onSelectAllFiltered]);

    const columns = useMemo<ColumnDef<QueueItem & { contact: Contact }>[]>(() => [
        {
            id: 'select',
            size: 30,
            header: ({ table }) => (
                <div className="px-1">
                    <Checkbox
                        checked={isAllFilteredSelected || table.getIsAllPageRowsSelected()}
                        onCheckedChange={(value) => {
                            table.toggleAllRowsSelected(!!value);
                            if (!value) {
                                onSelectAllFiltered(false);
                            }
                        }}
                        aria-label="Select all"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="px-1">
                    <Checkbox
                        checked={isAllFilteredSelected || row.getIsSelected()}
                        onCheckedChange={(value) => {
                            row.toggleSelected(!!value);
                            if (!value) {
                                onSelectAllFiltered(false);
                            }
                        }}
                        aria-label="Select row"
                    />
                </div>
            ),
        },
        {
            accessorFn: (row) => `${row.contact?.firstname || ''} ${row.contact?.surname || ''}`.trim() || '-',
            id: 'name',
            header: ({ column }) => (
                <div className="space-y-2">
                    <div className="flex items-center px-2 justify-between">
                        <span className="font-medium">Name</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                column.toggleSorting();
                                const sort = column.getIsSorted();
                                submit(
                                    { sort: sort ? `name.${sort}` : '' },
                                    { method: 'get' }
                                );
                            }}
                            className="h-8 px-2"
                        >
                            {column.getIsSorted() === "asc" ? (
                                <ChevronUp className="h-4 w-4" />
                            ) : column.getIsSorted() === "desc" ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronUp className="h-4 w-4 opacity-30" />
                            )}
                        </Button>
                    </div>
                    <div className="relative">
                        <Input
                            name="name"
                            placeholder="Filter names..."
                            defaultValue={defaultFilters.name}
                            onChange={(e) => submit(e.currentTarget.form!)}
                            className="h-8 w-full bg-white/50"
                        />
                    </div>
                </div>
            ),
        },
        {
            accessorFn: (row) => row.contact?.phone || '-',
            id: 'phone',
            header: ({ column }) => (
                <div className="space-y-2">
                    <div className="flex items-center px-2 justify-between">
                        <span className="font-medium">Phone</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                column.toggleSorting();
                                const sort = column.getIsSorted();
                                submit(
                                    { sort: sort ? `phone.${sort}` : '' },
                                    { method: 'get' }
                                );
                            }}
                            className="h-8 px-2"
                        >
                            {column.getIsSorted() === "asc" ? (
                                <ChevronUp className="h-4 w-4" />
                            ) : column.getIsSorted() === "desc" ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronUp className="h-4 w-4 opacity-30" />
                            )}
                        </Button>
                    </div>
                    <div className="relative">
                        <Input
                            name="phone"
                            placeholder="Filter phone..."
                            defaultValue={defaultFilters.phone}
                            onChange={(e) => submit(e.currentTarget.form!)}
                            className="h-8 w-full bg-white/50"
                        />
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
                    <div className="space-y-2 pb-2">
                        <div className="flex items-center px-2 justify-between">
                            <span className="font-medium">
                                {selectedRows.length > 0 || isAllFilteredSelected ? "Set Status" : "Status"}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    column.toggleSorting();
                                    const sort = column.getIsSorted();
                                    submit(
                                        { sort: sort ? `status.${sort}` : '' },
                                        { method: 'get' }
                                    );
                                }}
                                className="h-8 px-2"
                            >
                                {column.getIsSorted() === "asc" ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : column.getIsSorted() === "desc" ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronUp className="h-4 w-4 opacity-30" />
                                )}
                            </Button>
                        </div>
                        <select
                            name="status"
                            defaultValue={defaultFilters.status}
                            onChange={(e) => {
                                if (selectedRows.length > 0 || isAllFilteredSelected) {
                                    onStatusChange?.(selectedRows, e.target.value as typeof STATUS_OPTIONS[number]);
                                } else {
                                    submit(e.currentTarget.form!);
                                }
                            }}
                            className="h-8 w-full rounded border border-input bg-gray-100/50 px-3 text-xm"
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
                    onSelect={(status) => onStatusChange?.([row.original.id.toString()], status)}
                />
            ),
        },
    ], [isAllFilteredSelected, onSelectAllFiltered, rowSelection]);

    const table = useReactTable({
        data: queue,
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
        <Form method="get" className="space-y-4 py-4">
            {/* Selection Controls */}
            <div className="flex items-center gap-2 px-4">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllVisible}
                >
                    Select Visible ({queue.length})
                </Button>
                {totalCount && totalCount > pageSize && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={selectAllFiltered}
                    >
                        Select All Filtered ({totalCount})
                    </Button>
                )}
                {(Object.keys(rowSelection).length > 0 || isAllFilteredSelected) && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearSelection}
                    >
                        Clear Selection ({isAllFilteredSelected ? totalCount : Object.keys(rowSelection).length})
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="rounded-md border">
                <div className="relative">
                    <div className="max-h-[1000px] overflow-y-auto">
                        <table className="w-full">
                            <thead className="sticky top-0 bg-gray-200 border-b">
                                {table.getHeaderGroups().map(headerGroup => (
                                    <tr key={headerGroup.id}>
                                        {headerGroup.headers.map(header => (
                                            <th
                                                key={header.id}
                                                className="h-12 px-4 text-left align-middle font-medium text-primary font-bold"
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
                                            <td key={cell.id} className="p-2 px-4 text-xs">
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                <tr className="sticky bottom-0 bg-gray-200">
                                    <td colSpan={columns.length} className="p-4">
                                        {isAllFilteredSelected ?
                                            `Selected: ${totalCount}` :
                                            Object.keys(rowSelection).length > 0 ?
                                                `Selected: ${Object.keys(rowSelection).length}` :
                                                `Total: ${totalCount}`
                                        }
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4">
                <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount || 0)} of {totalCount} results
                </div>
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <Button
                                type="submit"
                                name="page"
                                value="1"
                                variant={currentPage === 1 ? "default" : "ghost"}
                            >
                                First
                            </Button>
                        </PaginationItem>
                        {getVisiblePages().map((page, idx) => (
                            page === 'ellipsis' ? (
                                <PaginationItem key={`ellipsis-${idx}`}>
                                    <PaginationEllipsis />
                                </PaginationItem>
                            ) : (
                                <PaginationItem key={page}>
                                    <Button
                                        type="submit"
                                        name="page"
                                        value={page}
                                        variant={currentPage === page ? "default" : "ghost"}
                                    >
                                        {page}
                                    </Button>
                                </PaginationItem>
                            )
                        ))}
                        <PaginationItem>
                            <Button
                                type="submit"
                                name="page"
                                value={totalPages.toString()}
                                variant={currentPage === totalPages ? "default" : "ghost"}
                            >
                                Last
                            </Button>
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </div>
        </Form>
    );
}

function StatusDropdown({ currentStatus, onSelect }: {
    currentStatus?: string;
    onSelect: (status: typeof STATUS_OPTIONS[number]) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                    {currentStatus || 'Status'} <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                {STATUS_OPTIONS.map((status) => (
                    <DropdownMenuItem
                        key={status}
                        onClick={() => onSelect(status)}
                    >
                        Set to {status}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}