import InfoHover from "@/components/shared/InfoPopover";
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
    voicemail_file?: string;
  };
  handleInputChange: (name: string, value: string) => void;
  mediaData: MediaItem[];
}

export default function SelectVoiceDrop({campaignData, handleInputChange, mediaData}: SelectVoiceDropProps) {
  return (
    <div className="flex flex-col min-w-48">
      <Label htmlFor="voicedrop_audio" className="mb-2 flex items-end gap-1">
        Live Voice Drop{" "}
        <InfoHover
          align="start"
          tooltip="Agents can diconnect and drop this message"
        />
      </Label>
      <Select
        value={campaignData.voicedrop_audio || campaignData.voicemail_file}
        onValueChange={(value) => handleInputChange("voicedrop_audio", value)}
      >
        <SelectTrigger id="voicedrop_audio">
          <SelectValue placeholder="Select voicemail file" />
        </SelectTrigger>
        <SelectContent>
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
