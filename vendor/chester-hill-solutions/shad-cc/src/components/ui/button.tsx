import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import {
  Button as ButtonPrimitive,
  Link as LinkPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
  type LinkProps as LinkPrimitiveProps,
} from "react-aria-components"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding font-heading text-sm font-semibold whitespace-nowrap transition-[color,background-color,box-shadow,transform] duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px data-pressed:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_-1.5px_0_0_rgb(0_0_0/0.2)] hover:bg-primary/90 active:bg-primary/80 active:shadow-none data-pressed:bg-primary/80 data-pressed:shadow-none",
        outline:
          "border-border bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent data-pressed:bg-accent aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:bg-transparent dark:hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[inset_0_-1.5px_0_0_rgb(0_0_0/0.08)] hover:bg-secondary/80 active:bg-secondary/70 active:shadow-none data-pressed:bg-secondary/70 data-pressed:shadow-none aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent data-pressed:bg-accent aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:hover:bg-accent/70",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[inset_0_-1.5px_0_0_rgb(0_0_0/0.2)] hover:bg-destructive/90 active:bg-destructive/80 active:shadow-none data-pressed:bg-destructive/80 data-pressed:shadow-none focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "font-sans font-medium text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-11 gap-1.5 px-8 has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<ButtonPrimitiveProps, "className"> &
  React.RefAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    className?: string
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

function LinkButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<LinkPrimitiveProps, "className"> &
  VariantProps<typeof buttonVariants> & {
    className?: string
  }) {
  return (
    <LinkPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, LinkButton, buttonVariants }
