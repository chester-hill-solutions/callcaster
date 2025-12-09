import { Label } from "~/components/ui/label";
import {
  SelectValue,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "~/components/ui/select";

interface MediaItem {
  name: string;
  signedUrl?: string;
}

interface SelectVoicemailProps {
  handleInputChange: (name: string, value: string) => void;
  campaignData: {
    voicemail_file?: string;
  };
  mediaData?: MediaItem[];
}

export default function SelectVoicemail({handleInputChange, campaignData, mediaData}: SelectVoicemailProps) {
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
