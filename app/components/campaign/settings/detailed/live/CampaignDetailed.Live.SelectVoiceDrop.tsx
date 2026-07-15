import InfoPopover from "@/components/shared/InfoPopover";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MediaItem {
  name: string;
}

interface SelectVoiceDropProps {
  campaignData: {
    voicedrop_audio?: string;
  };
  handleInputChange: (name: string, value: string | null) => void;
  mediaData: MediaItem[];
}

const NONE_VALUE = "__none__";

export default function SelectVoiceDrop({campaignData, handleInputChange, mediaData}: SelectVoiceDropProps) {
  const configuredFile = campaignData.voicedrop_audio?.trim() || null;
  const configuredFileAvailable = configuredFile
    ? mediaData.some((media) => media.name === configuredFile)
    : true;

  return (
    <div className="flex flex-col min-w-48">
      <Label htmlFor="voicedrop_audio" className="mb-2 flex items-end gap-1">
        Live Voice Drop{" "}
        <InfoPopover
          align="start"
          tooltip="Agents can diconnect and drop this message"
        />
      </Label>
      <Select
        value={configuredFile ?? NONE_VALUE}
        onValueChange={(value) =>
          handleInputChange("voicedrop_audio", value === NONE_VALUE ? null : value)
        }
      >
        <SelectTrigger id="voicedrop_audio">
          <SelectValue placeholder="Select voicemail file" />
        </SelectTrigger>
        <SelectContent>
          {configuredFile && !configuredFileAvailable ? (
            <SelectItem value={configuredFile} disabled>
              {configuredFile} — unavailable
            </SelectItem>
          ) : null}
          <SelectItem value={NONE_VALUE}>None</SelectItem>
          {mediaData?.map((media: MediaItem) => (
            <SelectItem key={media.name} value={media.name}>
              {media.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
