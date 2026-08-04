import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { Table as Table$1, TableHeader as TableHeader$1, TableBody as TableBody$1, TableFooter as TableFooter$1, Row, Column, Cell } from 'react-aria-components';
import { jsx } from 'react/jsx-runtime';

function Table({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "table-container",
      className: "relative w-full overflow-x-auto",
      children: /* @__PURE__ */ jsx(
        Table$1,
        {
          "data-slot": "table",
          className: cn("w-full caption-bottom text-sm", className),
          ...props
        }
      )
    }
  );
}
function TableHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    TableHeader$1,
    {
      "data-slot": "table-header",
      className: cn("[&_tr]:border-b", className),
      ...props
    }
  );
}
function TableBody({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    TableBody$1,
    {
      "data-slot": "table-body",
      className: cn(
        "data-empty:h-24 data-empty:text-center [&_tr:last-child]:border-0",
        className
      ),
      ...props
    }
  );
}
function TableFooter({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    TableFooter$1,
    {
      "data-slot": "table-footer",
      className: cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      ),
      ...props
    }
  );
}
function TableRow({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Row,
    {
      "data-slot": "table-row",
      className: cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted data-selected:bg-muted",
        className
      ),
      ...props
    }
  );
}
function TableHead({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Column,
    {
      "data-slot": "table-head",
      className: cn(
        "h-10 px-2 text-left align-middle font-heading text-xs font-semibold tracking-wide whitespace-nowrap text-foreground [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0",
        className
      ),
      ...props
    }
  );
}
function TableCell({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Cell,
    {
      "data-slot": "table-cell",
      className: cn(
        "p-2 align-middle whitespace-nowrap [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0",
        className
      ),
      ...props
    }
  );
}
function TableCaption({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "figcaption",
    {
      "data-slot": "table-caption",
      className: cn(
        "mt-4 text-center text-sm text-muted-foreground",
        className
      ),
      ...props
    }
  );
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
//# sourceMappingURL=chunk-IAUPWKMM.js.map
//# sourceMappingURL=chunk-IAUPWKMM.js.map