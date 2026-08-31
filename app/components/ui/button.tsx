import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";

import {
  Button as ShadButton,
  LinkButton,
  buttonVariants,
} from "@chester-hill-solutions/shad-cc/button";
import { cn } from "@/lib/utils";

export type ButtonProps = VariantProps<typeof buttonVariants> & {
  className?: string;
  asChild?: boolean;
  children?: React.ReactNode;
  disabled?: boolean;
  isDisabled?: boolean;
  title?: string;
  "data-testid"?: string;
} & Omit<
    React.ComponentPropsWithoutRef<typeof ShadButton>,
    "className" | "children" | "isDisabled" | "variant" | "size"
  >;

/**
 * #1319: destructive hover contrast override.
 *
 * The upstream shad-cc destructive variant is
 * `bg-destructive text-destructive-foreground hover:bg-destructive/90`
 * — hover lightens the red without touching text colour, and near-white
 * text on a lightened red fails the "readable at a glance" bar the
 * design team asked for. Fix belongs upstream long-term (see the note on
 * the issue), but flipping text to black on hover keeps every callsite
 * (Leave Campaign, Cancel, Delete, etc.) legible today with no upstream
 * cut. Kept as a local override so an upstream fix later simply removes
 * this line without a downstream churn.
 */
const DESTRUCTIVE_HOVER_OVERRIDE = "hover:text-black";

/**
 * CallCaster Button: shad-cc React Aria button + `asChild` + `disabled` alias.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "default",
      size = "default",
      asChild = false,
      disabled,
      isDisabled,
      onClick,
      ...props
    },
    ref,
  ) {
    const resolvedDisabled = isDisabled ?? disabled;
    // Prepend so a caller-supplied `hover:text-*` in `className` still
    // wins via tailwind-merge's last-occurrence rule.
    const variantOverride =
      variant === "destructive" ? DESTRUCTIVE_HOVER_OVERRIDE : undefined;
    const mergedClassName = cn(variantOverride, className);

    if (asChild) {
      return (
        <Slot
          ref={ref}
          data-slot="button"
          data-variant={variant}
          data-size={size}
          className={cn(buttonVariants({ variant, size, className: mergedClassName }))}
          aria-disabled={resolvedDisabled || undefined}
          onClick={onClick as React.MouseEventHandler<HTMLElement> | undefined}
          {...(props as React.HTMLAttributes<HTMLElement>)}
        />
      );
    }

    return (
      <ShadButton
        // RAC button ref typing differs slightly from HTMLButtonElement
        ref={ref as React.Ref<HTMLButtonElement>}
        className={mergedClassName}
        variant={variant}
        size={size}
        isDisabled={resolvedDisabled}
        onClick={onClick as React.ComponentProps<typeof ShadButton>["onClick"]}
        {...props}
      />
    );
  },
);

export { Button, LinkButton, buttonVariants };
