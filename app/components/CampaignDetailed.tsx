import React from "react";
import { Button } from "~/components/ui/button";
import { NavLink } from "@remix-run/react";
import { MdAdd } from "react-icons/md";
import { MessageSettings } from "./MessageSettings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "./ui/tooltip";
import InfoHover from "./InfoPopover";
import SelectVoicemail from "./CampaignDetailed.Voicemail";
import SelectScript from "./CampaignDetailed.SelectScript";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import ActivateButtons from "./CampaignDetailed.ActivateButtons";
import SelectVoiceDrop from "./CampaignDetailed.Live.SelectVoiceDrop";
import {
  DialTypeSwitch,
  HouseholdSwitch,
} from "./CampaignDetailed.Live.Switches";

export const CampaignTypeSpecificSettings = ({
  campaignData,
  handleInputChange,
  mediaData,
  scripts,
  handleActivateButton,
  details,
  mediaLinks,
  isChanged,
  isBusy,
  joinDisabled,
  isActive,
}) => {
  return (
    <>
      {campaignData.type !== "message" && (
        <div className="flex flex-wrap gap-4">
          <div className="flex items-end gap-2">
            <SelectVoicemail
              handleInputChange={handleInputChange}
              mediaData={mediaData}
              campaignData={campaignData}
            />
            <Button variant="outline" asChild size="icon" disabled={isBusy}>
              <NavLink to="../../../audios/new">
                <MdAdd />
              </NavLink>
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <SelectScript
              handleInputChange={handleInputChange}
              campaignData={campaignData}
              scripts={scripts}
            />
            <Button variant="outline" asChild size="icon" disabled={isBusy}>
              <NavLink
                to={`../../../scripts/new?ref=${campaignData.campaign_id}`}
              >
                <MdAdd />
              </NavLink>
            </Button>
          </div>
          <ActivateButtons
            joinDisabled={joinDisabled}
            isActive={isActive}
            isBusy={isBusy}
            campaignData={campaignData}
            handleActivateButton={handleActivateButton}
            handleScheduleButton={() => null}
          />
        </div>
      )}
      {campaignData.type === "live_call" && (
        <>
          <div className="my-4 w-full border-b-2 border-zinc-300 dark:border-zinc-600" />
          <div className="flex flex-wrap gap-2">
            <SelectVoiceDrop
              handleInputChange={handleInputChange}
              mediaData={mediaData}
              campaignData={campaignData}
            />
            <HouseholdSwitch
              handleInputChange={handleInputChange}
              campaignData={campaignData}
            />
            <DialTypeSwitch
              handleInputChange={handleInputChange}
              campaignData={campaignData}
            />
          </div>
        </>
      )}
      {campaignData.type === "message" && (
        <div>
          <MessageSettings
            mediaLinks={mediaLinks}
            details={details}
            campaignData={campaignData}
            onChange={handleInputChange}
          />
          <Button
            type="button"
            disabled={
              isBusy ||
              isChanged ||
              !(
                (campaignData.body_text || campaignData.message_media) &&
                campaignData.caller_id
              )
            }
            onClick={handleActivateButton}
          >
            Send
          </Button>
        </div>
      )}
    </>
  );
};
