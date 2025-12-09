import { Button } from "~/components/ui/button";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationEllipsis,
} from "~/components/ui/pagination";

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
    getVisiblePages,
    handleFilterChange,
}: QueueTablePaginationProps) {
    return (
        <div className="flex items-center justify-between px-2">
            <div className="text-xs text-muted-foreground">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} results
            </div>
            <Pagination>
                <PaginationContent>
                    <PaginationItem>
                        <Button
                            type="button"
                            onClick={() => handleFilterChange('page', '1')}
                            variant={currentPage === 1 ? "default" : "ghost"}
                            className="h-6 text-xs"
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
                                    type="button"
                                    onClick={() => handleFilterChange('page', page.toString())}
                                    variant={currentPage === page ? "default" : "ghost"}
                                    className="h-6 text-xs"
                                >
                                    {page}
                                </Button>
                            </PaginationItem>
                        )
                    ))}
                    <PaginationItem>
                        <Button
                            type="button"
                            onClick={() => handleFilterChange('page', totalPages.toString())}
                            variant={currentPage === totalPages ? "default" : "ghost"}
                            className="h-6 text-xs"
                        >
                            Last
                        </Button>
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        </div>
    );
} 