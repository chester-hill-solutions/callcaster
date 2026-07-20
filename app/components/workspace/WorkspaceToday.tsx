import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader } from "@/components/shared/Section";
import { getWorkspaceTodayCopy } from "@/lib/workspace-today-copy";
import { launchChecklistProgress } from "@/lib/workspace-launch-checklist";
import type { WorkspaceTodaySelection } from "@/lib/workspace-today.server";
import { cn } from "@/lib/utils";

export default function WorkspaceToday({
  today,
}: {
  today: WorkspaceTodaySelection;
}) {
  const copy = getWorkspaceTodayCopy(today);
  const checklist = today.launchChecklist ?? [];
  const progress =
    checklist.length > 0 ? launchChecklistProgress(checklist) : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Section variant="flat">
        <SectionHeader
          compact
          title={copy.title}
          description={copy.description}
        />
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Today · {copy.eyebrow}
        </p>
        {progress ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {progress.completeCount} of {progress.requiredCount} required steps
            complete
          </p>
        ) : null}
        <div className="mt-4">
          <Button asChild size="lg">
            <Link to={today.href}>
              {copy.actionLabel}
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Section>

      {checklist.length > 0 ? (
        <Section variant="flat" data-testid="launch-checklist">
          <SectionHeader
            compact
            title="Launch checklist"
            description="Continue from the setup wizard. Each item opens the matching step for your campaign path."
          />
          <ul className="divide-y divide-border/70 border-t border-border/70">
            {checklist.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="flex items-start gap-3 py-3 transition-colors hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                      item.complete
                        ? "border-success bg-success text-success-foreground"
                        : "border-muted-foreground/40",
                    )}
                    aria-hidden="true"
                  >
                    {item.complete ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          item.complete && "text-muted-foreground line-through",
                        )}
                      >
                        {item.label}
                      </span>
                      {item.due === "warning" ? (
                        <span className="text-xs text-muted-foreground">
                          Recommended
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
