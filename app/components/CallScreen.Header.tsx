import React from 'react';
import { Button } from "~/components/ui/button";

interface CampaignHeaderProps {
  campaign: {
    title: string;
  };
  count: number;
  completed: number;
  onLeaveCampaign: () => void;
  onReportError: () => void;
}

export const CampaignHeader: React.FC<CampaignHeaderProps> = ({
  campaign,
  count,
  completed,
  onLeaveCampaign,
  onReportError
}) => {
  return (
    <div className="flex flex-wrap justify-between px-4">
      <div className="flex flex-col justify-between gap-2 py-4">
        <div className="flex flex-col max-w-[400px] justify-between gap-2 sm:flex-nowrap">
          <div className="px-1 font-Zilla-Slab">
            <h1 className="text-3xl">{campaign.title}</h1>
            <h4>
              {count - completed} of {count} remaining
            </h4>
          </div>
          <div className="flex gap-2">
            <Button onClick={onLeaveCampaign}>
              Leave Campaign
            </Button>
            <Button variant="outline" onClick={onReportError}>
              Report Error
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};