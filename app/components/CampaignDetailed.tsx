import { Dropdown, Toggle } from "./Inputs";
import { Button } from "./ui/button";
import { NavLink } from "@remix-run/react";
import { MdAdd } from "react-icons/md";
import { MessageSettings } from "./MessageSettings";

export const CampaignTypeSpecificSettings = ({
  campaignData,
  handleInputChange,
  mediaData,
  scripts,
  handleActivateButton,
  details,
  mediaLinks,
  isChanged,
}) => {
  return (
    <>
      {campaignData.type !== "message" && (
        <div className="flex gap-2">
          <div className="flex items-end gap-1">
            <Dropdown
              name="voicemail_file"
              label="Voicemail File"
              value={campaignData.voicemail_file}
              onChange={(e) =>
                handleInputChange("voicemail_file", e.target.value)
              }
              options={mediaData?.map((media) => ({
                value: media.name,
                label: media.name,
              }))}
              className="flex flex-col"
            />
            <Button variant="outline" asChild>
              <NavLink to="../../../audios/new">
                <MdAdd />
              </NavLink>
            </Button>
          </div>
          <div className="flex items-end gap-1">
            <Dropdown
              name="script_id"
              label="Script"
              value={campaignData.script_id}
              onChange={(e) =>
                handleInputChange("script_id", parseInt(e.target.value))
              }
              options={scripts?.map((script) => ({
                value: script.id,
                label: script.name,
              }))}
              className="flex flex-col"
            />
            <Button variant="outline" asChild>
              <NavLink
                to={`../../../scripts/new?ref=${campaignData.campaign_id}`}
              >
                <MdAdd />
              </NavLink>
            </Button>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={!(campaignData.script_id && campaignData.caller_id)}
              onClick={handleActivateButton}
            >
              Activate Campaign
            </Button>
          </div>
        </div>
      )}
      {campaignData.type === "live_call" && (
        <>
          <div className="mb-4 w-full border-b-2 border-zinc-300 py-2 dark:border-zinc-600" />
          <div className="flex justify-start gap-8">
            <Toggle
              name="group_household_queue"
              label="Group by household"
              isChecked={campaignData.group_household_queue}
              onChange={(e) => handleInputChange("group_household_queue", e)}
              rightLabel="Yes"
            />
            <Toggle
              name="dial_type"
              label="Dial Type"
              isChecked={campaignData.dial_type === "predictive"}
              onChange={(e) =>
                handleInputChange("dial_type", e ? "predictive" : "call")
              }
              leftLabel="Power Dialer"
              rightLabel="Predictive Dialer"
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
