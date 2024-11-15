import { Button } from "~/components/ui/button";
import { NavLink } from "@remix-run/react";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Audience, CampaignAudience } from "~/lib/types";

export const AudienceSelection = ({ audiences, campaignData, handleAudience }: { audiences: Audience[], campaignData: CampaignSettingsData, handleAudience: (audience: CampaignAudience, isChecked: boolean) => void }) => {
  return (
    <>
      <div className="mb-4 w-full border-b-2 border-zinc-300 py-2 dark:border-zinc-600" />
      <h2 className="text-lg font-semibold mb-4">Audiences</h2>
      <div className="space-y-2 mb-4">
        {audiences.filter(Boolean).map((audience) => audience && (
          <div key={audience.id} className="flex items-center space-x-2">
            <Checkbox
              id={`${audience.id}-audience-select`}
              checked={campaignData.audiences?.length > 0 && campaignData.audiences.some(
                (selected: CampaignAudience) => selected?.audience_id === audience.id
              )}
              onCheckedChange={(checked) => handleAudience(audience, checked)}
            />
            <Label
              htmlFor={`${audience.id}-audience-select`}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {audience.name || `Unnamed Audience ${audience.id}`}
            </Label>
          </div>
        ))}
      </div>
      <Button asChild className="self-start">
        <NavLink to="../audiences/new" relative="path">
          Add an audience
        </NavLink>
      </Button>
    </>
  );
};