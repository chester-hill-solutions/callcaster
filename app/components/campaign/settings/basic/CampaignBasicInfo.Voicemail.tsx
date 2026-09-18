import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AddAudioSheet } from "../AddAudioSheet";
import SelectVoicemail from "../detailed/CampaignDetailed.Voicemail";
import SelectVoiceDrop from "../detailed/live/CampaignDetailed.Live.SelectVoiceDrop";
import type { Campaign, FileObject } from "@/lib/types";

interface CampaignVoicemailSettingsProps {
  campaignData: Campaign;
  mediaData: FileObject[];
  handleInputChange: (name: string, value: unknown) => void;
}

/**
 * Setup voicemail controls for voice campaigns (#1839): the switch that decides
 * whether a detected machine hears the voicemail, the audio it plays, and — for
 * live calling — the drop an agent can trigger mid-call. Text campaigns have no
 * voicemail, so they get nothing.
 */
export function CampaignVoicemailSettings({
  campaignData,
  mediaData,
  handleInputChange,
}: CampaignVoicemailSettingsProps) {
  const [addAudioOpen, setAddAudioOpen] = useState(false);
  const type = campaignData.type ? String(campaignData.type) : "";
  if (!type || type === "message") return null;

  const workspaceId = campaignData.workspace ? String(campaignData.workspace) : "";

  return (
    <div className="mt-6 space-y-4 rounded-md border p-4">
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

      {type === "live_call" ? (
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

      <AddAudioSheet
        workspaceId={workspaceId}
        open={addAudioOpen}
        onOpenChange={setAddAudioOpen}
      />
    </div>
  );
}
