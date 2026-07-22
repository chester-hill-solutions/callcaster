import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";

type Contact = { firstname?: string | null; surname?: string | null; phone?: string | null };
type QueueItem = { id: string | number; contact?: Contact | null };

interface CampaignSettingsQueueProps {
  queueCount: number;
  dequeuedCount: number;
  totalCount: number;
}

export const CampaignSettingsQueue = ({
  queueCount,
  dequeuedCount,
  totalCount,
}: CampaignSettingsQueueProps) => {
  const queued = queueCount || 0;
  const completed = dequeuedCount || 0;
  const total = totalCount || queued + completed;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {queued > 0
          ? `${queued.toLocaleString()} ready · ${completed.toLocaleString()} completed · ${total.toLocaleString()} total`
          : "Add contacts before launching this campaign."}
      </p>
      <Button variant="outline" size="sm" className="shrink-0 self-start sm:self-auto" asChild>
        <NavLink to="../queue">Manage queue</NavLink>
      </Button>
    </div>
  );
};
