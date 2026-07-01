import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Campaign } from "@/lib/types";

interface CampaignBasicInfoSelectPhaseProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | boolean) => void;
}

export default function SelectPhase({
  handleInputChange,
  campaignData,
}: CampaignBasicInfoSelectPhaseProps) {
  const value = (campaignData as Campaign & { phase?: string }).phase ?? "identification";

  return (
    <Select
      value={value}
      onValueChange={(next) => handleInputChange("phase", next)}
    >
      <SelectTrigger id="phase">
        <SelectValue placeholder="Identification" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="identification">Identification</SelectItem>
        <SelectItem value="persuasion">Persuasion</SelectItem>
        <SelectItem value="gotv">GOTV</SelectItem>
      </SelectContent>
    </Select>
  );
}
