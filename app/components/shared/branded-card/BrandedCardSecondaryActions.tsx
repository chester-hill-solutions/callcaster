import * as React from "react";

import { cn } from "@/lib/utils";

export const BrandedCardSecondaryActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("absolute right-2 top-2", className)}
    {...props}
  />
));
BrandedCardSecondaryActions.displayName = "BrandedCardSecondaryActions";
