import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Flags } from "~/lib/types";

interface CampaignData {
  type?: string;
}

export default function SelectType({
  handleInputChange,
  campaignData,
  flags,
}: {
  handleInputChange: (key: string, value: string) => void;
  campaignData: CampaignData;
  flags: Flags;
}) {
  const isLiveCallEnabled = true;
  const isMessageEnabled = true;
  const isRobocallEnabled = true;

  return (
    <Select
      value={campaignData.type}
      onValueChange={(value) => handleInputChange("type", value)}
    >
      <SelectTrigger id="type">
        <SelectValue placeholder="Interactive Voice Recording" />
      </SelectTrigger>
      <SelectContent>
        {isMessageEnabled && (
          <SelectItem value="message">Message</SelectItem>
        )}
        {isRobocallEnabled && (
          <SelectItem value="robocall">
            Interactive Voice Recording
          </SelectItem>
        )}
        {isLiveCallEnabled && (
          <SelectItem value="live_call">Live Call</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}