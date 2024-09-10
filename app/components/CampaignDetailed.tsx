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
import { Info } from "lucide-react";

export const InfoHover = ({size = 18, tooltip = '', align = "center"}) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
    <TooltipTrigger>
      <Info size={size}/>
    </TooltipTrigger>
    <TooltipContent align={align}>
      <p>{tooltip}</p>
    </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

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
}) => {
  console.log(campaignData)
  return (
    <>
      {campaignData.type !== "message" && (
        <div className="flex flex-wrap gap-4">
          <div className="flex items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="voicemail_file">Voicemail File</Label>
              <Select
                value={campaignData.voicemail_file}
                onValueChange={(value) =>
                  handleInputChange("voicemail_file", value)
                }
              >
                <SelectTrigger id="voicemail_file" className="w-[200px]">
                  <SelectValue placeholder="Select voicemail file" />
                </SelectTrigger>
                <SelectContent>
                  {mediaData?.map((media) => (
                    <SelectItem key={media.name} value={media.name}>
                      {media.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" asChild size="icon" disabled={isBusy}>
              <NavLink to="../../../audios/new">
                <MdAdd />
              </NavLink>
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="script_id">Script</Label>
              <Select
                value={campaignData.script_id?.toString()}
                onValueChange={(value) =>
                  handleInputChange("script_id", parseInt(value))
                }
              >
                <SelectTrigger id="script_id" className="w-[200px]">
                  <SelectValue placeholder="Select script" />
                </SelectTrigger>
                <SelectContent>
                  {scripts?.map((script) => (
                    <SelectItem key={script.id} value={script.id.toString()}>
                      {script.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" asChild size="icon" disabled={isBusy}>
              <NavLink
                to={`../../../scripts/new?ref=${campaignData.campaign_id}`}
              >
                <MdAdd />
              </NavLink>
            </Button>
          </div>
          <div className="flex items-end">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`flex ${joinDisabled ? "cursor-not-allowed" : ""}`}
                  >
                    <Button
                      type="button"
                      disabled={
                        joinDisabled ||
                        isBusy ||
                        !(campaignData.script_id && campaignData.caller_id)
                      }
                      onClick={handleActivateButton}
                    >
                      Activate Campaign
                    </Button>
                  </div>
                </TooltipTrigger>
                {joinDisabled && (
                  <TooltipContent align="start">
                    <p>{joinDisabled}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}
      {campaignData.type === "live_call" && (
    <>
    <div className="my-4 w-full border-b-2 border-zinc-300 dark:border-zinc-600" />
    <div className="flex flex-col space-y-6">
      <div className="w-full max-w-xs">
        <Label htmlFor="voicedrop_audio" className="mb-2 flex items-end">Live Voice Drop <InfoHover align="start" tooltip="Agents can diconnect and drop this message"/></Label>
        <Select
          value={campaignData.voicedrop_audio}
          onValueChange={(value) => handleInputChange("voicedrop_audio", value)}
        >
          <SelectTrigger id="voicedrop_audio" className="w-full">
            <SelectValue placeholder="Select voicemail file" />
          </SelectTrigger>
          <SelectContent>
            {mediaData?.map((media) => (
              <SelectItem key={media.name} value={media.name}>
                {media.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="group_household_queue"
            checked={campaignData.group_household_queue}
            onCheckedChange={(checked) =>
              handleInputChange("group_household_queue", checked)
            }
          />
          <Label htmlFor="group_household_queue">
            Group by household
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Label htmlFor="dial_type" className="whitespace-nowrap">Dial Type:</Label>
          <div className="flex items-center space-x-2">
            <span className={campaignData.dial_type !== "predictive" ? "font-semibold" : ""}>
              Power
            </span>
            <Switch
              id="dial_type"
              checked={campaignData.dial_type === "predictive"}
              onCheckedChange={(checked) =>
                handleInputChange(
                  "dial_type",
                  checked ? "predictive" : "call",
                )
              }
            />
            <span className={campaignData.dial_type === "predictive" ? "font-semibold" : ""}>
              Predictive
            </span>
          </div>
        </div>
      </div>
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
