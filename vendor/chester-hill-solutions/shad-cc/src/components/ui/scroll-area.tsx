"use client"

import * as React from "react"

import { cn } from "../../lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area"
      className={cn(
        "cc-scrollbar relative overflow-auto outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-1",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { ScrollArea }
