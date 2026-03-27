import * as React from "react";

import { Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {}

export function Section({ children, className, ...props }: SectionProps) {
  return (
    <section
      className={cn(
        " p-6 text-card-foreground shadow-sm",
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
}

export function SectionHeader({
  actions,
  branded,
  className,
  description,
  title,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between",
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
