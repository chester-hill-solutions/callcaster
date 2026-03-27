import * as React from "react";

import { Card as UiCard } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface BrandedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  bgColorClassName?: string;
  bgColor?: string;
}

export const BrandedCard = React.forwardRef<HTMLDivElement, BrandedCardProps>(
  ({ className, bgColor, bgColorClassName, ...props }, ref) => (
    <UiCard
      ref={ref}
      className={cn(
        "relative rounded-lg border-border/80 bg-card shadow-md dark:shadow-none",
        bgColor,
        bgColorClassName,
        className,
      )}
      {...props}
    />
  ),
);
BrandedCard.displayName = "BrandedCard";
