import TablePagination from "@/components/shared/TablePagination";

interface QueueTablePaginationProps {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalCount: number;
    getVisiblePages: () => (number | 'ellipsis')[];
    handleFilterChange: (key: string, value: string) => void;
}

export function QueueTablePagination({
    currentPage,
    totalPages,
    pageSize,
    totalCount,
    getVisiblePages: _getVisiblePages,
    handleFilterChange,
}: QueueTablePaginationProps) {
    return (
        <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalCount={totalCount}
            showSummary
            onPageChange={(page) => handleFilterChange("page", page.toString())}
        />
    );
} 