import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type TablePaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  maxVisiblePages?: number;
  totalCount?: number;
  pageSize?: number;
  showSummary?: boolean;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
};
const TablePagination = ({
  currentPage,
  totalPages,
  onPageChange,
  maxVisiblePages = 5,
  pageSize,
  showSummary = false,
  totalCount,
  pageSizeOptions,
  onPageSizeChange,
}: TablePaginationProps) => {
  const renderPaginationItems = () => {
    const items = [];
    const halfMaxVisiblePages = Math.floor(maxVisiblePages / 2);

    let startPage = Math.max(1, currentPage - halfMaxVisiblePages);
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      items.push(
        <PaginationItem key="start-ellipsis" className="text-muted-foreground">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i} className="text-muted-foreground">
          <button
            type="button"
            aria-label={`Go to page ${i}`}
            aria-current={i === currentPage ? "page" : undefined}
            className={buttonVariants({
              variant: i === currentPage ? "outline" : "ghost",
              size: "icon",
            })}
            onClick={() => onPageChange(i)}
          >
            {i}
          </button>
        </PaginationItem>
      );
    }

    if (endPage < totalPages) {
      items.push(
        <PaginationItem key="end-ellipsis" className="text-muted-foreground">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    return items;
  };

  return (
    <div className="flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
      {showSummary && totalCount != null && pageSize != null ? (
        <div className="flex flex-wrap items-center gap-3">
          {pageSizeOptions && onPageSizeChange ? (
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className="w-[100px]" aria-label="Rows per page">
                <SelectValue placeholder="Per page" />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} per page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="text-xs text-muted-foreground">
            Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)} to{" "}
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount} results
          </div>
        </div>
      ) : null}
      <Pagination className="mx-0 justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem className="text-muted-foreground">
            <button
              type="button"
              aria-label="Go to previous page"
              className={cn(
                buttonVariants({ variant: "ghost", size: "default" }),
                "gap-1 pl-2.5",
              )}
              disabled={currentPage === 1}
              onClick={() => {
                if (currentPage > 1) {
                  onPageChange(currentPage - 1);
                }
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>
          </PaginationItem>
          {renderPaginationItems()}
          <PaginationItem className="text-muted-foreground">
            <button
              type="button"
              aria-label="Go to next page"
              className={cn(
                buttonVariants({ variant: "ghost", size: "default" }),
                "gap-1 pr-2.5",
              )}
              disabled={currentPage >= totalPages}
              onClick={() => {
                if (currentPage < totalPages) {
                  onPageChange(currentPage + 1);
                }
              }}
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

export default TablePagination;
