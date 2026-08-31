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
        // #1343: xl activates at 1280px viewport, but after the workspace
        // nav rail (252px), page padding (48px), and panel padding (48px),
        // the actual grid container on a 13" MacBook is ~916px. The
        // previous fixed columns (340 + 420 + 380 + gap) demanded 1172px
        // and forced a horizontal scroll. `minmax(min, ideal)` lets each
        // column shrink when the viewport can't afford it while still
        // reaching its ideal at wider breakpoints; the center column keeps
        // `1fr` so extra space still flows into the reading surface.
        "xl:grid-cols-[minmax(220px,320px)_minmax(340px,1fr)_minmax(260px,340px)]",
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
