import { Button } from "@/components/ui/button";
import { NavLink } from "@remix-run/react";
import { MdAdd } from "react-icons/md";
import { MessageSettings } from "@/components/settings/MessageSettings";
import { FileObject } from "@supabase/storage-js";
import SelectVoicemail from "./CampaignDetailed.Voicemail";
import SelectScript from "./CampaignDetailed.SelectScript";
import ActivateButtons from "./CampaignDetailed.ActivateButtons";
import SelectVoiceDrop from "./live/CampaignDetailed.Live.SelectVoiceDrop";
import {
  DialTypeSwitch,
  HouseholdSwitch,
} from "./live/CampaignDetailed.Live.Switches";
import { Campaign, IVRCampaign, LiveCampaign, MessageCampaign, Script, Survey, Schedule } from "@/lib/types";
import { AlertCircle } from "lucide-react";
import { Tables } from "@/lib/database.types";

type LiveCampaignDetails = Tables<"live_campaign"> & { script: Script };
type MessageCampaignDetails = Tables<"message_campaign">;
type IVRCampaignDetails = Tables<"ivr_campaign"> & { script: Script };

export const CampaignTypeSpecificSettings = ({
  campaignData,
  handleInputChange,
  mediaData,
  scripts,
  handleActivateButton,
  handleScheduleButton,
  details,
  mediaLinks,
  isChanged,
  isBusy,
  joinDisabled,
  scheduleDisabled,
  surveys,
  handleNavigate: _handleNavigate,
}: {
  campaignData: NonNullable<Campaign>,
  handleInputChange: (name: string, value: unknown) => void,
  mediaData: FileObject[],
  scripts: Script[],
  handleActivateButton: (type: "play" | "pause" | "archive" | "schedule") => void,
  handleScheduleButton: () => void,
  details: LiveCampaignDetails | MessageCampaignDetails | IVRCampaignDetails,
  mediaLinks: string[],
  isChanged: boolean,
  isBusy: boolean,
  joinDisabled: string | null,
  scheduleDisabled: string | boolean,
  surveys: Pick<Survey, "survey_id" | "title">[],
  handleNavigate: (e: React.MouseEvent<HTMLButtonElement>) => void,
}) => {
  const isScriptRequired = !('script_id' in details) && !('body_text' in details);

  return (
    <>
      {campaignData.type !== "message" && (
        <div className="flex flex-wrap gap-4">
          <div className="flex items-end gap-2">
              <SelectVoicemail
                handleInputChange={handleInputChange}
                mediaData={mediaData}
                campaignData={{
                  ...(campaignData.voicemail_file && { voicemail_file: campaignData.voicemail_file }),
                }}
              />
            <Button variant="outline" asChild size="icon" disabled={isBusy}>
              <NavLink to="../../../audios/new">
                <MdAdd />
              </NavLink>
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-end gap-2">
              <SelectScript
                handleInputChange={handleInputChange}
                selectedScript={'script_id' in details && details.script_id ? details.script_id : 0}
                scripts={scripts}
              />
              <Button variant="outline" asChild size="icon" disabled={isBusy}>
                <NavLink
                  to={`../../../scripts/new?ref=${campaignData.id}`}
                >
                  <MdAdd />
                </NavLink>
              </Button>
            </div>
            {isScriptRequired && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Script is required
              </p>
            )}
          </div>
          <ActivateButtons
            joinDisabled={joinDisabled}
            scheduleDisabled={scheduleDisabled}
            isBusy={isBusy}
            handleScheduleButton={() => handleScheduleButton()}
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
              campaignData={{
                ...('voicedrop_audio' in details && details.voicedrop_audio && { voicedrop_audio: details.voicedrop_audio }),
                ...(campaignData.voicemail_file && { voicemail_file: campaignData.voicemail_file }),
              }}
            />
            <HouseholdSwitch
              handleInputChange={handleInputChange}
              campaignData={{
                group_household_queue: campaignData.group_household_queue,
                dial_type: campaignData.dial_type || "call",
              }}
            />
            <DialTypeSwitch
              handleInputChange={handleInputChange}
              campaignData={{
                group_household_queue: campaignData.group_household_queue,
                dial_type: campaignData.dial_type || "call",
              }}
            />
          </div>
        </>
      )}
      {campaignData.type === "message" && (
        <div className="flex flex-col gap-4">
          <MessageSettings
            mediaLinks={mediaLinks}
            details={details as MessageCampaignDetails}
            onChange={handleInputChange}
            surveys={surveys}
          />
          {isScriptRequired && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Message content is required
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              disabled={
                isBusy ||
                isChanged ||
                !(
                  ('body_text' in details && details.body_text) ||
                  ('message_media' in details && details.message_media) &&
                  campaignData.caller_id
                )
              }
              onClick={() => handleActivateButton("play")}
            >
              Send Now
            </Button>
            <Button
              type="button"
              disabled={!!scheduleDisabled || isBusy}
              onClick={() => handleScheduleButton()}
            >
              Schedule Campaign
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
