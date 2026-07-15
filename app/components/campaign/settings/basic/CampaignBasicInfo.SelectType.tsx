import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Campaign } from "@/lib/types";

interface CampaignBasicInfoSelectTypeProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | boolean) => void;
  flags?: Record<string, boolean>;
}

const CAMPAIGN_TYPE_OPTIONS = [
  { value: "message", label: "Message" },
  { value: "robocall", label: "Interactive Voice Recording" },
  { value: "simple_ivr", label: "Simple IVR" },
  { value: "complex_ivr", label: "Complex IVR" },
  { value: "live_call", label: "Live Call" },
] as const;

export default function SelectType({
  handleInputChange,
  campaignData,
}: CampaignBasicInfoSelectTypeProps) {
  const selectedType = campaignData.type ? String(campaignData.type) : "";
  const isLegacyType =
    selectedType.length > 0 &&
    !CAMPAIGN_TYPE_OPTIONS.some((option) => option.value === selectedType);

  return (
    <Select
      value={selectedType}
      onValueChange={(value) => handleInputChange("type", value)}
    >
      <SelectTrigger id="type">
        <SelectValue placeholder="Interactive Voice Recording" />
      </SelectTrigger>
      <SelectContent>
        {isLegacyType ? (
          <SelectItem value={selectedType} disabled>
            {selectedType} — legacy (unsupported)
          </SelectItem>
        ) : null}
        {CAMPAIGN_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}