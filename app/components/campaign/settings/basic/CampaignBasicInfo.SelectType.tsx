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
  { value: "robocall", label: "Automated phone menu" },
  { value: "live_call", label: "Live calling" },
] as const;

const ADVANCED_IVR_OPTIONS = [
  { value: "simple_ivr", label: "Simple IVR" },
  { value: "complex_ivr", label: "Complex IVR" },
] as const;

export default function SelectType({
  handleInputChange,
  campaignData,
}: CampaignBasicInfoSelectTypeProps) {
  const selectedType = campaignData.type ? String(campaignData.type) : "";
  const isAdvancedIvr = ADVANCED_IVR_OPTIONS.some(
    (option) => option.value === selectedType,
  );
  const isLegacyType =
    selectedType.length > 0 &&
    !CAMPAIGN_TYPE_OPTIONS.some((option) => option.value === selectedType) &&
    !isAdvancedIvr;

  return (
    <div className="space-y-3">
      <Select
        value={isAdvancedIvr ? "" : selectedType}
        onValueChange={(value) => handleInputChange("type", value)}
      >
        <SelectTrigger id="type">
          <SelectValue placeholder={isAdvancedIvr ? "Advanced IVR" : "Select campaign goal"} />
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

      <details
        className="rounded-md border bg-muted/20 px-3 py-2"
        open={isAdvancedIvr || undefined}
      >
        <summary className="cursor-pointer text-sm font-medium">
          Advanced IVR
        </summary>
        <div className="pt-3">
          <Select
            value={isAdvancedIvr ? selectedType : ""}
            onValueChange={(value) => handleInputChange("type", value)}
          >
            <SelectTrigger id="advanced-ivr-type" aria-label="Advanced IVR type">
              <SelectValue placeholder="Select an IVR type" />
            </SelectTrigger>
            <SelectContent>
              {ADVANCED_IVR_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </details>
    </div>
  );
}