import * as React from "react";

import { cn } from "@/lib/utils";

export const BrandedCardActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("mt-6 flex flex-col gap-4 sm:flex-row", className)}
    {...props}
  />
));
BrandedCardActions.displayName = "BrandedCardActions";
