import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Heading, Text } from "@/components/ui/typography";

type PageShellMaxWidth = "content" | "narrow" | "full";

const maxWidthClasses: Record<PageShellMaxWidth, string> = {
  content: "mx-auto w-full max-w-5xl",
  narrow: "mx-auto w-full max-w-2xl",
  full: "w-full",
};

type PageShellProps = {
  title: string;
  description?: string;
  /** Right-aligned slot for page-level actions (buttons, links). */
  actions?: ReactNode;
  /**
   * Width constraint. Default "full" — workspace panels already constrain
   * width; use "content"/"narrow" for standalone or admin pages.
   */
  maxWidth?: PageShellMaxWidth;
  className?: string;
  children?: ReactNode;
};

/**
 * Canonical wrapper for non-list pages: a title/description header row with
 * an actions slot, followed by consistently spaced content. List pages with
 * empty states should use WorkspaceResourceListShell instead.
 */
export function PageShell({
  title,
  description,
  actions,
  maxWidth = "full",
  className,
  children,
}: PageShellProps) {
  return (
    <div className={cn("flex flex-col gap-6", maxWidthClasses[maxWidth], className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <Heading as="h1" level={2} branded={false}>
            {title}
          </Heading>
          {description ? <Text variant="muted">{description}</Text> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center justify-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>

      {children}
    </div>
  );
}
