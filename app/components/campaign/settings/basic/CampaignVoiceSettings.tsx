import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AddAudioSheet } from "../AddAudioSheet";
import SelectVoicemail from "../detailed/CampaignDetailed.Voicemail";
import SelectVoiceDrop from "../detailed/live/CampaignDetailed.Live.SelectVoiceDrop";
import {
  DialTypeSwitch,
  HouseholdSwitch,
} from "../detailed/live/CampaignDetailed.Live.Switches";
import type { Campaign, FileObject } from "@/lib/types";

interface CampaignVoiceSettingsProps {
  campaignData: Campaign;
  mediaData: FileObject[];
  handleInputChange: (name: string, value: unknown) => void;
}

/** Campaign types that dial by voice and therefore have voicemail/dial settings. */
const VOICE_CAMPAIGN_TYPES = new Set([
  "robocall",
  "simple_ivr",
  "complex_ivr",
  "live_call",
]);

/**
 * Setup voice settings (#1839, #1863): everything a voice campaign needs to
 * answer a machine and dial. One section owns the voice-type gate, so the rule
 * for "what a voice campaign shows on Setup" lives in one place. Text campaigns
 * get nothing.
 */
export function CampaignVoiceSettings({
  campaignData,
  mediaData,
  handleInputChange,
}: CampaignVoiceSettingsProps) {
  const [addAudioOpen, setAddAudioOpen] = useState(false);
  const type = campaignData.type ? String(campaignData.type) : "";
  if (!VOICE_CAMPAIGN_TYPES.has(type)) return null;

  const isLiveCall = type === "live_call";
  const workspaceId = campaignData.workspace ? String(campaignData.workspace) : "";

  return (
    <div className="mt-6 space-y-6 rounded-md border p-4">
      <div className="space-y-4">
        <p className="text-sm font-medium">Voicemail</p>

        <div className="flex items-start gap-3">
          <Switch
            id="voicemail_drop_enabled"
            checked={Boolean(campaignData.voicemail_drop_enabled)}
            onCheckedChange={(checked) =>
              handleInputChange("voicemail_drop_enabled", checked)
            }
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="voicemail_drop_enabled">Voicemail drop</Label>
            <p className="text-xs text-muted-foreground">
              When an answering machine picks up, play the recording below and hang up.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <SelectVoicemail
            handleInputChange={handleInputChange}
            mediaData={mediaData}
            campaignData={{
              ...(campaignData.voicemail_file && {
                voicemail_file: campaignData.voicemail_file,
              }),
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddAudioOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add audio
          </Button>
        </div>

        {isLiveCall ? (
          <SelectVoiceDrop
            handleInputChange={handleInputChange}
            mediaData={mediaData}
            campaignData={{
              ...(campaignData.voicedrop_audio && {
                voicedrop_audio: campaignData.voicedrop_audio,
              }),
            }}
          />
        ) : null}
      </div>

      {isLiveCall ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Calling options</p>
          <div className="flex flex-wrap gap-2">
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
        </div>
      ) : null}

      <AddAudioSheet
        workspaceId={workspaceId}
        open={addAudioOpen}
        onOpenChange={setAddAudioOpen}
      />
    </div>
  );
}
