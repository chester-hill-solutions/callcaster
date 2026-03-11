import * as React from "react";

import {
  Card as UiCard,
  CardContent as UiCardContent,
  CardHeader as UiCardHeader,
} from "@/components/ui/card";
import { Heading } from "@/components/ui/typography";
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
        "relative rounded-lg border-border/80 bg-white shadow-md dark:border-white dark:bg-zinc-900 dark:shadow-none",
        bgColor,
        bgColorClassName,
        className,
      )}
      {...props}
    />
  ),
);
BrandedCard.displayName = "BrandedCard";

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

export const BrandedCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <UiCardContent ref={ref} className={cn("space-y-6 pt-6", className)} {...props} />
));
BrandedCardContent.displayName = "BrandedCardContent";

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
