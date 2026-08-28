import { LinkButton } from './chunk-C6TALT53.js';
import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';
import { jsx, jsxs } from 'react/jsx-runtime';

function Pagination({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "nav",
    {
      role: "navigation",
      "aria-label": "pagination",
      "data-slot": "pagination",
      className: cn("mx-auto flex w-full justify-center", className),
      ...props
    }
  );
}
function PaginationContent({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "ul",
    {
      "data-slot": "pagination-content",
      className: cn("flex items-center gap-1", className),
      ...props
    }
  );
}
function PaginationItem({ ...props }) {
  return /* @__PURE__ */ jsx("li", { "data-slot": "pagination-item", ...props });
}
function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}) {
  return /* @__PURE__ */ jsx(
    LinkButton,
    {
      variant: isActive ? "outline" : "ghost",
      size,
      className: cn(className),
      "aria-current": isActive ? "page" : void 0,
      "data-slot": "pagination-link",
      "data-active": isActive,
      ...props
    }
  );
}
function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    PaginationLink,
    {
      "aria-label": "Go to previous page",
      size: "default",
      className: cn("pl-1.5!", className),
      ...props,
      children: [
        /* @__PURE__ */ jsx(ChevronLeftIcon, { "data-icon": "inline-start" }),
        /* @__PURE__ */ jsx("span", { className: "hidden sm:block", children: text })
      ]
    }
  );
}
function PaginationNext({
  className,
  text = "Next",
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    PaginationLink,
    {
      "aria-label": "Go to next page",
      size: "default",
      className: cn("pr-1.5!", className),
      ...props,
      children: [
        /* @__PURE__ */ jsx("span", { className: "hidden sm:block", children: text }),
        /* @__PURE__ */ jsx(ChevronRightIcon, { "data-icon": "inline-end" })
      ]
    }
  );
}
function PaginationEllipsis({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    "span",
    {
      "aria-hidden": true,
      "data-slot": "pagination-ellipsis",
      className: cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className
      ),
      ...props,
      children: [
        /* @__PURE__ */ jsx(
          MoreHorizontalIcon,
          {}
        ),
        /* @__PURE__ */ jsx("span", { className: "sr-only", children: "More pages" })
      ]
    }
  );
}

export { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious };
//# sourceMappingURL=chunk-IUNUFKR6.js.map
//# sourceMappingURL=chunk-IUNUFKR6.js.map