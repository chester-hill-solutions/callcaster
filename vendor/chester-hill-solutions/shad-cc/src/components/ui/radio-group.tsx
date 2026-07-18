"use client"

import {
  composeRenderProps,
  RadioGroup as RadioGroupPrimitive,
  Radio as RadioPrimitive,
  type RadioGroupProps,
  type RadioProps,
} from "react-aria-components"

import { cn } from "../../lib/utils"

function RadioGroup({ className, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full gap-3", className)}
      {...props}
    />
  )
}

function RadioGroupItem({ className, children, ...props }: RadioProps) {
  return (
    <RadioPrimitive
      data-slot="radio-group-item"
      // The RAC Radio renders a <label> wrapping the circle and any label
      // text, so the root is a row and the indicator carries the visuals.
      className={cn(
        "group/radio-group-item peer relative flex w-fit shrink-0 items-center gap-2 text-sm outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      {composeRenderProps(children, (children, { isSelected }) => (
        <>
          <span
            data-slot="radio-group-indicator"
            className="relative flex aspect-square size-4 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-[0_1px_0_0_var(--border)] group-data-[focus-visible]/radio-group-item:border-ring group-data-[focus-visible]/radio-group-item:ring-3 group-data-[focus-visible]/radio-group-item:ring-ring/40 group-data-[invalid]/radio-group-item:border-destructive group-data-[invalid]/radio-group-item:ring-3 group-data-[invalid]/radio-group-item:ring-destructive/20 dark:group-data-[invalid]/radio-group-item:border-destructive/50 dark:group-data-[invalid]/radio-group-item:ring-destructive/40 group-data-[selected]/radio-group-item:border-primary group-data-[selected]/radio-group-item:bg-primary group-data-[selected]/radio-group-item:text-primary-foreground"
          >
            {isSelected && (
              <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground dark:size-2.5" />
            )}
          </span>
          {children}
        </>
      ))}
    </RadioPrimitive>
  )
}

export { RadioGroup, RadioGroupItem }
