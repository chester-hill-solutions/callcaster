import * as React from "react";

import { CardHeader as UiCardHeader } from "@/components/ui/card";
import { Heading } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export const BrandedCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ children, className, ...props }, ref) => (
  <UiCardHeader className="pb-0">
    <Heading
      ref={ref}
      as="h2"
      level={2}
      branded
      className={cn("text-center", className)}
      {...props}
    >
      {children}
    </Heading>
  </UiCardHeader>
));
BrandedCardTitle.displayName = "BrandedCardTitle";
