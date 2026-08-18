import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CallWorkbenchProps {
  incoming?: ReactNode;
  call: ReactNode;
  household?: ReactNode;
  script: ReactNode;
  queue?: ReactNode;
  className?: string;
}

/**
 * Presentation-only workbench for the operator's continuous call loop.
 *
 * Desktop (xl+): three columns — queue rail (left), script/questionnaire
 * (center, min 420px reading surface), action column (right: call panel
 * with status, contact, controls, disposition, and household-member
 * switcher). The action column and queue rail stay sticky below the top
 * chrome while long scripts scroll.
 *
 * Below xl: single stacked column in task order — incoming, call panel
 * (with disposition), household, script. The queue rail is hidden; the
 * queue sheet in the top chrome remains the entry point.
 */
export function CallWorkbench({
  incoming,
  call,
  household,
  script,
  queue,
  className,
}: CallWorkbenchProps) {
  return (
    <section
      className={cn(
        "grid w-full grid-cols-1 items-start gap-4 pb-20 sm:pb-6",
        "xl:grid-cols-[340px_minmax(420px,1fr)_380px]",
        className,
      )}
      aria-label="Call workspace"
    >
      {incoming ? <div className="xl:col-span-3">{incoming}</div> : null}
      <div className="order-1 flex min-w-0 flex-col gap-4 xl:sticky xl:top-20 xl:order-3">
        {call}
        {household}
      </div>
      <div className="order-2 flex min-w-0 flex-col gap-4 xl:order-2">
        {script}
      </div>
      {queue ? (
        <div className="order-3 hidden xl:sticky xl:top-20 xl:order-1 xl:block">
          {queue}
        </div>
      ) : null}
    </section>
  );
}
