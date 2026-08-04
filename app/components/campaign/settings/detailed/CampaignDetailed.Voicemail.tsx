import { Label } from "@/components/ui/label";
import {
  SelectValue,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface MediaItem {
  name: string;
}

interface SelectVoicemailProps {
  handleInputChange: (name: string, value: string | null) => void;
  campaignData: {
    voicemail_file?: string;
  };
  mediaData: MediaItem[];
}

const NONE_VALUE = "__none__";

export default function SelectVoicemail({handleInputChange, campaignData, mediaData}: SelectVoicemailProps) {
  const configuredFile = campaignData.voicemail_file?.trim() || null;
  const configuredFileAvailable = configuredFile
    ? mediaData.some((media) => media.name === configuredFile)
    : true;

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="voicemail_file">Voicemail File</Label>
      <Select
        value={configuredFile ?? NONE_VALUE}
        onValueChange={(value) =>
          handleInputChange("voicemail_file", value === NONE_VALUE ? null : value)
        }
      >
        <SelectTrigger id="voicemail_file" className="w-[200px]">
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
