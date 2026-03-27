import * as React from "react";

import { CardContent as UiCardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const BrandedCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <UiCardContent ref={ref} className={cn("space-y-6 pt-6", className)} {...props} />
));
BrandedCardContent.displayName = "BrandedCardContent";
