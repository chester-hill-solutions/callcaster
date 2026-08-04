import {
  composeRenderProps,
  Switch as SwitchPrimitive,
  type SwitchProps as SwitchPrimitiveProps,
} from "react-aria-components"

import { cn } from "../../lib/utils"

function Switch({
  className,
  size = "default",
  children,
  ...props
}: SwitchPrimitiveProps & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center gap-2 outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {composeRenderProps(children, (children) => (
        <>
          <span
            data-slot="switch-track"
            className={cn(
              "relative inline-flex shrink-0 items-center rounded-md border-2 border-transparent bg-muted transition-all after:absolute after:-inset-x-3 after:-inset-y-2",
              "group-data-[size=default]/switch:h-5 group-data-[size=default]/switch:w-8 group-data-[size=sm]/switch:h-4 group-data-[size=sm]/switch:w-6",
              "group-data-selected/switch:border-primary group-data-selected/switch:bg-primary",
              "group-data-focus-visible/switch:border-ring group-data-focus-visible/switch:ring-3 group-data-focus-visible/switch:ring-ring/40",
              "group-data-invalid/switch:border-destructive group-data-invalid/switch:ring-3 group-data-invalid/switch:ring-destructive/20 dark:group-data-invalid/switch:border-destructive/50 dark:group-data-invalid/switch:ring-destructive/40"
            )}
          >
            <span
              data-slot="switch-thumb"
              className={cn(
                "pointer-events-none block translate-x-0 rounded-sm bg-background shadow-[0_1px_0_0_var(--border)] ring-0 transition-transform not-dark:bg-clip-padding dark:bg-foreground",
                "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
                "group-data-selected/switch:translate-x-[calc(100%-4px)] dark:group-data-selected/switch:bg-primary-foreground"
              )}
            />
          </span>
          {children}
        </>
      ))}
    </SwitchPrimitive>
  )
}

export { Switch }
