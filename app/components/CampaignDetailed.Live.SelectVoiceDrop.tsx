import InfoHover from "./InfoPopover";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export default function SelectVoiceDrop({campaignData, handleInputChange, mediaData}) {
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
        value={campaignData.voicedrop_audio}
        onValueChange={(value) => handleInputChange("voicedrop_audio", value)}
      >
        <SelectTrigger id="voicedrop_audio">
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
  );
}
