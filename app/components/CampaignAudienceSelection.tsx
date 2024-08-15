import { Button } from "./ui/button";
import { NavLink } from "@remix-run/react";

export const AudienceSelection = ({ audiences, campaignData, handleAudience }) => {
  return (
  <>
    <div className="mb-4 w-full border-b-2 border-zinc-300 py-2 dark:border-zinc-600" />
    <span className="text-lg font-semibold">Audiences:</span>
    {audiences.filter(Boolean).map((audience) => (
      <div key={audience.id} className="flex gap-2">
        <input
          type="checkbox"
          id={`${audience.id}-audience-select`}
          checked={campaignData.audiences.some(
            (selected) => selected?.audience_id === audience.id
          )}
          onChange={(e) => handleAudience(audience, e.target.checked)}
        />
        <label htmlFor={`${audience.id}-audience-select`}>
          {audience.name || `Unnamed Audience ${audience.id}`}
        </label>
      </div>
    ))}
    <div>
      <Button asChild>
        <NavLink to="../audiences/new" relative="path">
          Add an audience
        </NavLink>
      </Button>
    </div>
  </>
)};
