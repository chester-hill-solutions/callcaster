import { NavLink } from "@remix-run/react";
import { Button } from "@/components/ui/button";
import { Tables } from "@/lib/database.types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };

interface CampaignSettingsQueueProps {
  campaignQueue: QueueItem[];
  queueCount: number;
  dequeuedCount: number;
  totalCount: number;
}

export const CampaignSettingsQueue = ({
  campaignQueue,
  queueCount,
  dequeuedCount,
  totalCount,
}: CampaignSettingsQueueProps) => {
  const queued = queueCount || 0;
  const completed = dequeuedCount || 0;
  const total = totalCount || queued + completed;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="space-y-2">
          <div>
            <h2 className="font-medium">Queue Readiness</h2>
            <p className="text-sm text-muted-foreground">
              {queued > 0
                ? `${queued} contacts are ready right now.`
                : "Add contacts before starting this campaign."}
            </p>
          </div>
          <div className="flex items-center divide-x">
            <div className="pr-4">
              <span className="text-xs text-muted-foreground">Ready to send</span>
              <p className="text-sm font-medium">{queued}</p>
            </div>
            <div className="px-4">
              <span className="text-xs text-muted-foreground">Completed</span>
              <p className="text-sm font-medium">{completed}</p>
            </div>
            <div className="pl-4">
              <span className="text-xs text-muted-foreground">Completion</span>
              <p className="text-sm font-medium">{completionRate}%</p>
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
        {queued > 10 && (
          <div className="px-4 py-2 text-center text-xs text-muted-foreground">
            + {queued - 10} more contacts
          </div>
        )}
      </div>
    </div>
  );
}; 