import { Label } from "@radix-ui/react-dropdown-menu";
import {
  SelectValue,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "./ui/select";

export default function SelectVoicemail({handleInputChange, campaignData, mediaData}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="voicemail_file">Voicemail File</Label>
      <Select
        value={campaignData.voicemail_file}
        onValueChange={(value) => handleInputChange("voicemail_file", value)}
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
  );
}
