import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { getWorkspaceTodayCopy } from "@/lib/workspace-today-copy";
import type { WorkspaceTodaySelection } from "@/lib/workspace-today.server";

export default function WorkspaceToday({
  today,
}: {
  today: WorkspaceTodaySelection;
}) {
  const copy = getWorkspaceTodayCopy(today);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="space-y-3">
        <Text
          as="p"
          variant="caption"
          className="font-semibold uppercase tracking-[0.16em]"
        >
          Today · {copy.eyebrow}
        </Text>
        <Heading as="h1" level={1} branded={false}>
          {copy.title}
        </Heading>
        <Text variant="muted" className="max-w-2xl text-base">
          {copy.description}
        </Text>
      </div>
      <div>
        <Button asChild size="lg">
          <Link to={today.href}>
            {copy.actionLabel}
            <ArrowRight className="ml-2 size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
