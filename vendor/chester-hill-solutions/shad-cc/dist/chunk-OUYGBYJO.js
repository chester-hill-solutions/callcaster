import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { cva } from 'class-variance-authority';
import { jsx } from 'react/jsx-runtime';

var alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-md border px-4 py-3 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Tone colors carry the border, the wash, and the icon — never the
        // body text. Tone-on-wash text (e.g. text-destructive on
        // bg-destructive/12) fails WCAG contrast in dark themes, so the body
        // stays foreground-based like the `default` variant while the icon
        // and surfaces signal the tone.
        default: "border-brand-tertiary bg-brand-wash text-foreground *:data-[slot=alert-description]:text-muted-foreground",
        destructive: "border-destructive/40 bg-destructive/12 text-foreground *:data-[slot=alert-description]:text-foreground/85 *:[svg]:text-destructive",
        success: "border-success/40 bg-success/12 text-foreground *:data-[slot=alert-description]:text-foreground/85 *:[svg]:text-success",
        warning: "border-warning/45 bg-warning/15 text-foreground *:data-[slot=alert-description]:text-foreground/85 *:[svg]:text-warning",
        // Info's sky wash (`bg-secondary/70`) stays light in dark themes —
        // brand-secondary is not overridden by `.dark` — so its body pairs
        // with `secondary-foreground` (dark text) in both themes.
        info: "border-info/40 bg-secondary/70 text-secondary-foreground *:data-[slot=alert-description]:text-secondary-foreground/85 *:[svg]:text-info"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Alert({
  className,
  variant,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert",
      role: "alert",
      className: cn(alertVariants({ variant }), className),
      ...props
    }
  );
}
function AlertTitle({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-title",
      className: cn(
        "font-heading font-semibold group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      ),
      ...props
    }
  );
}
function AlertDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-description",
      className: cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      ),
      ...props
    }
  );
}
function AlertAction({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-slot": "alert-action",
      className: cn("absolute top-2.5 right-3", className),
      ...props
    }
  );
}

export { Alert, AlertAction, AlertDescription, AlertTitle, alertVariants };
//# sourceMappingURL=chunk-OUYGBYJO.js.map
//# sourceMappingURL=chunk-OUYGBYJO.js.map