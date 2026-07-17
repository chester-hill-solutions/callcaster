import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getWorkspaceTodayCopy } from "@/lib/workspace-today-copy";
import type { WorkspaceTodaySelection } from "@/lib/workspace-today.server";

export default function WorkspaceToday({
  today,
}: {
  today: WorkspaceTodaySelection;
}) {
  const copy = getWorkspaceTodayCopy(today);

  return (
    <Card className="mx-auto w-full max-w-3xl border-border/80 bg-background/80">
      <CardHeader className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Today · {copy.eyebrow}
        </p>
        <h1 className="font-Tabac-Slab text-3xl font-black text-foreground sm:text-4xl">
          {copy.title}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          {copy.description}
        </p>
      </CardHeader>
      <CardContent>
        <Button asChild size="lg">
          <Link to={today.href}>
            {copy.actionLabel}
            <ArrowRight className="ml-2 size-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
