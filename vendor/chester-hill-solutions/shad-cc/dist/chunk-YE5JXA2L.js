import {
  cn
} from "./chunk-DN2AEEA2.js";

// src/components/ui/breadcrumb.tsx
import "react";
import {
  Breadcrumb as BreadcrumbPrimitive,
  Breadcrumbs as BreadcrumbsPrimitive,
  composeRenderProps,
  Link as LinkPrimitive
} from "react-aria-components";
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Breadcrumb({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "nav",
    {
      "aria-label": "breadcrumb",
      "data-slot": "breadcrumb",
      className: cn(className),
      ...props
    }
  );
}
function BreadcrumbList({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    BreadcrumbsPrimitive,
    {
      "data-slot": "breadcrumb-list",
      className: cn(
        "flex flex-wrap items-center gap-1.5 font-heading text-sm font-medium wrap-break-word text-muted-foreground sm:gap-2.5",
        className
      ),
      ...props
    }
  );
}
function BreadcrumbItem({
  className,
  children,
  separatorClassName,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    BreadcrumbPrimitive,
    {
      "data-slot": "breadcrumb-item",
      className: cn("inline-flex items-center gap-1.5", className),
      ...props,
      children: composeRenderProps(children, (children2, { isCurrent }) => /* @__PURE__ */ jsxs(Fragment, { children: [
        children2,
        !isCurrent && /* @__PURE__ */ jsx(
          "span",
          {
            "data-slot": "breadcrumb-separator",
            role: "presentation",
            "aria-hidden": "true",
            className: cn("[&>svg]:size-3.5", separatorClassName),
            children: /* @__PURE__ */ jsx(ChevronRightIcon, {})
          }
        )
      ] }))
    }
  );
}
function BreadcrumbLink({ className, render, ...props }) {
  return /* @__PURE__ */ jsx(
    LinkPrimitive,
    {
      "data-slot": "breadcrumb-link",
      className: cn("transition-colors hover:text-foreground", className),
      render,
      ...props
    }
  );
}
function BreadcrumbPage({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      "data-slot": "breadcrumb-page",
      role: "link",
      "aria-disabled": "true",
      "aria-current": "page",
      className: cn("font-heading font-semibold text-foreground", className),
      ...props
    }
  );
}
function BreadcrumbEllipsis({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsxs(
    "span",
    {
      "data-slot": "breadcrumb-ellipsis",
      role: "presentation",
      "aria-hidden": "true",
      className: cn(
        "flex size-5 items-center justify-center [&>svg]:size-4",
        className
      ),
      ...props,
      children: [
        /* @__PURE__ */ jsx(
          MoreHorizontalIcon,
          {}
        ),
        /* @__PURE__ */ jsx("span", { className: "sr-only", children: "More" })
      ]
    }
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbEllipsis
};
//# sourceMappingURL=chunk-YE5JXA2L.js.map