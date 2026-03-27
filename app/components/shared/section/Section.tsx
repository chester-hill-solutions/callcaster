import * as React from "react";

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
