import { cn } from './chunk-DN2AEEA2.js';
import { cva } from 'class-variance-authority';
import { jsx } from 'react/jsx-runtime';

var badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-2 py-0.5 font-heading text-xs font-semibold whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/90",
        secondary: "border border-secondary bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive: "bg-destructive text-destructive-foreground focus-visible:ring-destructive/20 [a]:hover:bg-destructive/90",
        success: "bg-success text-success-foreground focus-visible:ring-success/20 [a]:hover:bg-success/90",
        warning: "bg-warning text-warning-foreground focus-visible:ring-warning/20 [a]:hover:bg-warning/90",
        outline: "border-brand-tertiary bg-brand-wash text-foreground [a]:hover:bg-brand-tertiary/50 [a]:hover:text-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/60",
        link: "text-primary underline-offset-4 hover:underline"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Badge({
  className,
  variant = "default",
  render,
  ...props
}) {
  if (render) {
    const renderProps = {
      "data-slot": "badge",
      "data-variant": variant,
      className: cn(badgeVariants({ variant }), className),
      ...props
    };
    return render(renderProps);
  }
  return /* @__PURE__ */ jsx(
    "span",
    {
      "data-slot": "badge",
      "data-variant": variant,
      className: cn(badgeVariants({ variant }), className),
      ...props
    }
  );
}

export { Badge, badgeVariants };
//# sourceMappingURL=chunk-AAXVUWXE.js.map
//# sourceMappingURL=chunk-AAXVUWXE.js.map