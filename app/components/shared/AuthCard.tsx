import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Heading, Text, type HeadingProps } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export interface AuthCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  headerContent?: React.ReactNode;
  contentClassName?: string;
  /**
   * Tag to render the card's title as. Defaults to "h1" for the common case
   * where this card's title is the page's only heading (signin, reset
   * password, etc). Pass "h2" when the page already renders its own h1
   * above/around the card, so the page never ends up with two h1s.
   */
  headingAs?: HeadingProps["as"];
}

export function AuthCard({
  children,
  className,
  contentClassName,
  description,
  headerContent,
  title,
  headingAs = "h1",
  ...props
}: AuthCardProps) {
  return (
    <Card
      className={cn(
        "w-full max-w-xl border-border/80 bg-brand-secondary/95 shadow-lg dark:border-white/30 dark:bg-background/90 dark:shadow-none",
        className,
      )}
      {...props}
    >
      <CardHeader className="space-y-3 text-center">
        <Heading level={1} as={headingAs} branded className="text-4xl sm:text-5xl">
          {title}
        </Heading>
        {description ? (
          <CardDescription className="text-base text-muted-foreground">
            <Text as="span" variant="lead" className="text-inherit">
              {description}
            </Text>
          </CardDescription>
        ) : null}
        {headerContent}
      </CardHeader>
      <CardContent className={cn("space-y-6", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
