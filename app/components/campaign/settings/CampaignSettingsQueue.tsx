import { NavLink } from "@remix-run/react";
import { Button } from "@/components/ui/button";
import { Tables } from "@/lib/database.types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };

interface CampaignSettingsQueueProps {
  campaignQueue: QueueItem[];
  queueCount: number;
  totalCount: number;
}

export const CampaignSettingsQueue = ({
  campaignQueue,
  queueCount,
  totalCount,
}: CampaignSettingsQueueProps) => {
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-6">
          <h2 className="font-medium">Queue Preview</h2>
          <div className="flex items-center divide-x">
            <div className="pr-4">
              <span className="text-xs text-muted-foreground">Queued</span>
              <p className="text-sm font-medium">{queueCount || 0}</p>
            </div>
            <div className="pl-4">
              <span className="text-xs text-muted-foreground">Dequeued</span>
              <p className="text-sm font-medium">{totalCount - queueCount || 0}</p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <NavLink to="../queue">Manage Queue</NavLink>
        </Button>
      </div>

      <div className="divide-y">
        {campaignQueue?.slice(0, 10).map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2">
            <div className="flex-1">
              <p className="text-sm font-medium">
                {`${item.contact?.firstname} ${item.contact?.surname}` || '-'}
              </p>
              <p className="text-xs text-muted-foreground">{item.contact?.phone}</p>
            </div>
          </div>
        ))}
        {queueCount > 10 && (
          <div className="px-4 py-2 text-center text-xs text-muted-foreground">
            + {queueCount - 10} more contacts
          </div>
        )}
      </div>
    </div>
  );
}; 