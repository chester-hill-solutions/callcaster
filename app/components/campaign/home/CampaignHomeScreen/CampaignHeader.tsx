import { NavLink } from "react-router";
import { Megaphone } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Heading } from "@/components/ui/typography";
import type { Enums } from "@/lib/db-types";
import {
  CampaignQueueProgress,
  type CampaignQueueProgressCounts,
} from "@/components/campaign/CampaignQueueProgress";

type HeaderProps = {
  title: string;
  isDesktop: boolean;
  status: Enums<"campaign_status">;
  queueProgress?: CampaignQueueProgressCounts | null;
};

export const CampaignHeader = ({
  title,
  isDesktop = false,
  status,
  queueProgress,
}: HeaderProps) => {
  return (
    <div
      className={`mt-2 ${isDesktop ? "hidden sm:flex" : "flex sm:hidden"} justify-center gap-2 ${isDesktop ? "rounded-xl border border-border/80 bg-card/70 p-2" : ""}`}
    >
      <NavLink
        className={`${isDesktop ? "flex items-center gap-2" : ""} text-foreground hover:text-brand-primary`}
        to="."
        relative="path"
        end
      >
        {isDesktop && <Megaphone className="h-[18px] w-[18px]" />}
        <Heading as="h3" level={3} branded={false} className="inline">
          {title}
        </Heading>
        <StatusBadge status={status} className="ml-2" />
        {queueProgress?.totalCount ? (
          <CampaignQueueProgress
            completedCount={queueProgress.completedCount}
            totalCount={queueProgress.totalCount}
            className="ml-1 text-xs font-medium normal-case"
          />
        ) : null}
      </NavLink>
    </div>
  );
};
