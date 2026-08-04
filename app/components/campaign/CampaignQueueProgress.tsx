import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export type CampaignQueueProgressCounts = {
  completedCount: number;
  totalCount: number;
};

export function campaignQueueProgressTooltip(
  completedCount: number,
  totalCount: number,
): string {
  if (totalCount <= 0) {
    return "No contacts in queue";
  }

  const remaining = Math.max(totalCount - completedCount, 0);
  if (remaining === 0) {
    return "Queue complete";
  }

  return `${remaining} left`;
}

interface CampaignQueueProgressProps extends CampaignQueueProgressCounts {
  className?: string;
}

export function CampaignQueueProgress({
  completedCount,
  totalCount,
  className,
}: CampaignQueueProgressProps) {
  if (totalCount <= 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Text
            as="span"
            variant="small"
            data-testid="campaign-queue-progress"
            className={cn(
              "tabular-nums normal-case tracking-normal",
              className,
            )}
          >
            {completedCount} / {totalCount}
          </Text>
        </TooltipTrigger>
        <TooltipContent>
          <p>{campaignQueueProgressTooltip(completedCount, totalCount)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
