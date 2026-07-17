import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OperatorColumnProps {
  incoming?: ReactNode;
  call: ReactNode;
  disposition?: ReactNode;
  household?: ReactNode;
  script: ReactNode;
  className?: string;
}

/**
 * Presentation-only shell for the operator's continuous work loop:
 * contact and call controls, household context, then script.
 */
export function OperatorColumn({
  incoming,
  call,
  disposition,
  household,
  script,
  className,
}: OperatorColumnProps) {
  return (
    <section
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col gap-4 pb-20 sm:pb-6",
        className,
      )}
      aria-label="Call workspace"
    >
      {incoming}
      {call}
      {household}
      {script}
      {disposition}
    </section>
  );
}
