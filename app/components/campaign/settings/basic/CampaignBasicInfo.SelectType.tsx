import { AUTOMATED_PHONE_MENU_LABEL } from "@/lib/campaign-goals";
import { FormField } from "@/components/ui/form-field";
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
  { value: "message", label: "Text campaign" },
  { value: "robocall", label: AUTOMATED_PHONE_MENU_LABEL },
  { value: "live_call", label: "Live calling" },
] as const;

const LEGACY_IVR_TYPES = new Set(["simple_ivr", "complex_ivr"]);

export default function SelectType({
  handleInputChange,
  campaignData,
}: CampaignBasicInfoSelectTypeProps) {
  const selectedType = campaignData.type ? String(campaignData.type) : "";
  const displayType = LEGACY_IVR_TYPES.has(selectedType) ? "robocall" : selectedType;
  const isLegacyType =
    selectedType.length > 0 &&
    !CAMPAIGN_TYPE_OPTIONS.some((option) => option.value === selectedType) &&
    !LEGACY_IVR_TYPES.has(selectedType);

  return (
    <div className="space-y-3">
      <FormField label="Campaign type" htmlFor="type">
        <Select
          value={displayType}
          onValueChange={(value) => handleInputChange("type", value)}
        >
          <SelectTrigger id="type">
            <SelectValue placeholder="Select campaign goal" />
          </SelectTrigger>
          <SelectContent>
            {isLegacyType ? (
              <SelectItem value={selectedType} disabled>
                {selectedType} · Legacy campaign
              </SelectItem>
            ) : null}
            {CAMPAIGN_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </div>
  );
}
