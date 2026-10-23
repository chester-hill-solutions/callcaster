import { Badge } from "@/components/ui/badge";
import { formatStatusLabel } from "@/components/ui/status-badge";
import { campaignStatusBadgeClass } from "@/lib/campaign-status";
import { cn } from "@/lib/utils";

type CampaignStatusBadgeProps = {
  status: string;
  label?: string;
  className?: string;
};

/** Renders the shared campaign lifecycle colors without changing generic status badges. */
export function CampaignStatusBadge({
  status,
  label,
  className,
}: CampaignStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0",
        // The shared campaign-status map is the source of truth for these classes.
        // eslint-disable-next-line shadcn/require-static-classes
        campaignStatusBadgeClass(status),
        className,
      )}
    >
      {label ?? formatStatusLabel(status)}
    </Badge>
  );
}
