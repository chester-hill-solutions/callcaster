import React from "react";
import { Button } from "~/components/ui/button";
import { NavLink } from "@remix-run/react";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
  const isButtonDisabled = 
    isChanged ||
    (campaignData.type !== "message"
      ? !(campaignData.script_id && campaignData.caller_id)
      : !((campaignData.body_text || campaignData.message_media) && campaignData.caller_id));

  const formatStartTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric', 
      hour: 'numeric', 
      minute: 'numeric', 
      hour12: true 
    });
  };

  return (
    <div className="space-y-8 pt-4">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {campaignData.type !== "message" && (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="voicemail_file" className="flex items-center">
                  Voicemail File
                </Label>
                <div className="flex items-center space-x-2">
                  <Select
                    value={campaignData.voicemail_file}
                    onValueChange={(value) => handleInputChange("voicemail_file", value)}
                  >
                    <SelectTrigger id="voicemail_file">
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
                  <Button variant="outline" asChild>
                    <NavLink to="../../../audios/new">
                      <MdAdd />
                    </NavLink>
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="script_id" className="flex items-center">
                  Script
                </Label>
                <div className="flex items-center space-x-2">
                  <Select
                    value={campaignData.script_id?.toString()}
                    onValueChange={(value) => handleInputChange("script_id", parseInt(value))}
                  >
                    <SelectTrigger id="script_id">
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
                  <Button variant="outline" asChild>
                    <NavLink to={`../../../scripts/new?ref=${campaignData.campaign_id}`}>
                      <MdAdd />
                    </NavLink>
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
        {campaignData.type === "live_call" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dial_type" className="flex items-center">
                Dial Type
              </Label>
              <Select
                value={campaignData.dial_type}
                onValueChange={(value) => handleInputChange("dial_type", value)}
              >
                <SelectTrigger id="dial_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Power Dialer</SelectItem>
                  <SelectItem value="predictive">Predictive Dialer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {campaignData.type === "message" && (
          <div className="col-span-2">
            <MessageSettings
              mediaLinks={mediaLinks}
              details={details}
              campaignData={campaignData}
              onChange={handleInputChange}
            />
          </div>
        )}
      </div>
      <div className="mt-6 gap-6 flex">
        <Button
          type="button"
          disabled={isButtonDisabled}
          onClick={() => handleActivateButton(false)}
          className="w-full"
        >
          Start Now
        </Button>
        <Button
          type="button"
          disabled={isButtonDisabled || !campaignData.start_date}
          onClick={() => handleActivateButton(true)}
          className="w-full"
        >
          Start at {formatStartTime(campaignData.start_date)}
        </Button>
      </div>
    </div>
  );
};

export default CampaignTypeSpecificSettings;