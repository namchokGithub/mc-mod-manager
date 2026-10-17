import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { PAGE_SIZES, type Page, type PageSize } from "../lib/pagination";
import { Button } from "./ui/button";
import { Select } from "./ui/select";

/** Shared pager for Preview and Manage: range summary, page size, and first/prev/next/last. */
export function Pagination({
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  label,
  noun = { one: "mod", many: "mods" },
}: {
  page: Page<unknown>;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  /** Accessible name for the navigation landmark. */
  label: string;
  /** What is being paged; defaults to mods. */
  noun?: { one: string; many: string };
}) {
  const atStart = page.page <= 1;
  const atEnd = page.page >= page.pageCount;
  return (
    <nav className="pagination" aria-label={label}>
      <span className="pagination-summary" role="status">
        Showing {page.from}–{page.to} of {page.total}{" "}
        {page.total === 1 ? noun.one : noun.many}
      </span>
      <div className="pagination-controls">
        <Select
          aria-label={`${noun.many.charAt(0).toUpperCase()}${noun.many.slice(1)} per page`}
          size="sm"
          variant="compact"
          className="pagination-size"
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
          options={PAGE_SIZES.map((size) => ({
            value: String(size),
            label: `${size} per page`,
          }))}
        />
        <Button
          variant="ghost"
          size="small"
          disabled={atStart}
          onClick={() => onPageChange(1)}
          aria-label="First page"
          title="First page"
        >
          <ChevronsLeft size={15} />
        </Button>
        <Button
          variant="ghost"
          size="small"
          disabled={atStart}
          onClick={() => onPageChange(page.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
          <span className="pagination-label">Previous</span>
        </Button>
        <span className="pagination-page" aria-current="page">
          Page {page.page} of {page.pageCount}
        </span>
        <Button
          variant="ghost"
          size="small"
          disabled={atEnd}
          onClick={() => onPageChange(page.page + 1)}
          aria-label="Next page"
        >
          <span className="pagination-label">Next</span>
          <ChevronRight size={15} />
        </Button>
        <Button
          variant="ghost"
          size="small"
          disabled={atEnd}
          onClick={() => onPageChange(page.pageCount)}
          aria-label="Last page"
          title="Last page"
        >
          <ChevronsRight size={15} />
        </Button>
      </div>
    </nav>
  );
}
