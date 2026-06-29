import * as React from "react";

import { Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** elevated = standalone card; flat = in-panel section (no nested card chrome) */
  variant?: "elevated" | "flat";
}

export function Section({
  children,
  className,
  variant = "elevated",
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        variant === "elevated"
          ? "rounded-lg border border-border/80 bg-card p-6 text-card-foreground shadow-sm"
          : "space-y-4 border-b border-border/60 pb-8 last:border-b-0 last:pb-0",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export interface SectionHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  branded?: boolean;
  /** tighter spacing when nested in a flat in-panel section */
  compact?: boolean;
}

export function SectionHeader({
  actions,
  branded,
  className,
  compact,
  description,
  title,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border/60 sm:flex-row sm:items-start sm:justify-between",
        compact ? "mb-4 pb-3" : "mb-6 pb-4",
        className,
      )}
      {...props}
    >
      <div className="space-y-1">
        <Heading level={3} branded={branded}>
          {title}
        </Heading>
        {description ? <Text variant="muted">{description}</Text> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
