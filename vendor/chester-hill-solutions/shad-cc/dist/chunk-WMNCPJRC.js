import { cn } from './chunk-DN2AEEA2.js';
import { Checkbox as Checkbox$1, composeRenderProps } from 'react-aria-components';
import { CheckIcon } from 'lucide-react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

function Checkbox({ className, children, ...props }) {
  return /* @__PURE__ */ jsx(
    Checkbox$1,
    {
      "data-slot": "checkbox",
      className: cn(
        "group/checkbox peer relative flex w-fit shrink-0 items-center gap-2 text-sm outline-none select-none group-has-disabled/field:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      ),
      ...props,
      children: composeRenderProps(
        children,
        (children2, { isSelected, isIndeterminate }) => /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              "data-slot": "checkbox-indicator",
              className: "grid size-4 shrink-0 place-content-center rounded-sm border border-border bg-card shadow-[0_1px_0_0_var(--border)] transition-shadow [&>svg]:size-3.5 group-data-[focus-visible]/checkbox:border-ring group-data-[focus-visible]/checkbox:ring-2 group-data-[focus-visible]/checkbox:ring-ring/40 group-data-[invalid]/checkbox:border-destructive group-data-[invalid]/checkbox:ring-2 group-data-[invalid]/checkbox:ring-destructive/20 dark:group-data-[invalid]/checkbox:border-destructive/50 dark:group-data-[invalid]/checkbox:ring-destructive/40 group-data-[selected]/checkbox:border-primary group-data-[selected]/checkbox:bg-primary group-data-[selected]/checkbox:text-primary-foreground group-data-[indeterminate]/checkbox:border-primary group-data-[indeterminate]/checkbox:bg-primary group-data-[indeterminate]/checkbox:text-primary-foreground group-data-[invalid]/checkbox:group-data-[selected]/checkbox:border-primary",
              children: (isSelected || isIndeterminate) && /* @__PURE__ */ jsx(
                CheckIcon,
                {}
              )
            }
          ),
          children2
        ] })
      )
    }
  );
}

export { Checkbox };
//# sourceMappingURL=chunk-WMNCPJRC.js.map
//# sourceMappingURL=chunk-WMNCPJRC.js.map