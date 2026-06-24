import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export interface AuthCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  headerContent?: React.ReactNode;
  contentClassName?: string;
}

export function AuthCard({
  children,
  className,
  contentClassName,
  description,
  headerContent,
  title,
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
        <Heading level={1} branded className="text-4xl sm:text-5xl">
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
