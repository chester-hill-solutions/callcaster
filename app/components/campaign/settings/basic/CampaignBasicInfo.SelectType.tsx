import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flags } from "@/lib/types";

interface CampaignBasicInfoSelectTypeProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | boolean) => void;
  flags: Record<string, boolean>;
}

export default function SelectType({
  handleInputChange,
  campaignData,
  flags,
}: CampaignBasicInfoSelectTypeProps) {
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