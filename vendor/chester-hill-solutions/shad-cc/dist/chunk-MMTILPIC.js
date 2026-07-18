import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { DisclosureGroup, Disclosure, Heading, Button, DisclosurePanel } from 'react-aria-components';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { jsx, jsxs } from 'react/jsx-runtime';

function Accordion({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    DisclosureGroup,
    {
      "data-slot": "accordion",
      className: cn(
        "flex w-full flex-col overflow-hidden rounded-md border border-border shadow-[0_2px_0_0_var(--border)]",
        className
      ),
      ...props
    }
  );
}
function AccordionItem({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Disclosure,
    {
      "data-slot": "accordion-item",
      className: cn("not-last:border-b data-open:bg-brand-wash/50", className),
      ...props
    }
  );
}
function AccordionTrigger({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(Heading, { className: "flex", children: /* @__PURE__ */ jsxs(
    Button,
    {
      slot: "trigger",
      "data-slot": "accordion-trigger",
      className: cn(
        "group/accordion-trigger relative flex flex-1 items-start justify-between gap-6 border border-transparent p-4 text-left font-heading text-sm font-semibold transition-all outline-none hover:bg-accent hover:no-underline disabled:pointer-events-none disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsx(ChevronDownIcon, { "data-slot": "accordion-trigger-icon", className: "pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden" }),
        /* @__PURE__ */ jsx(ChevronUpIcon, { "data-slot": "accordion-trigger-icon", className: "pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline" })
      ]
    }
  ) });
}
function AccordionContent({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    DisclosurePanel,
    {
      "data-slot": "accordion-content",
      className: "h-(--disclosure-panel-height) overflow-clip px-4 text-sm transition-[height] data-open:animate-accordion-down data-closed:animate-accordion-up",
      ...props,
      children: /* @__PURE__ */ jsx(
        "div",
        {
          className: cn(
            "pt-0 pb-4 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
            className
          ),
          children
        }
      )
    }
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
//# sourceMappingURL=chunk-MMTILPIC.js.map
//# sourceMappingURL=chunk-MMTILPIC.js.map