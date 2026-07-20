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

    if (asChild) {
      return (
        <Slot
          ref={ref}
          data-slot="button"
          data-variant={variant}
          data-size={size}
          className={cn(buttonVariants({ variant, size, className }))}
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
        className={className}
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
