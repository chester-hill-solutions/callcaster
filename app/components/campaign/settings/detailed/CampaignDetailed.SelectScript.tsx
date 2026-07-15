import {
  SelectValue,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Script } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CampaignDetailedSelectScriptProps {
  selectedScript: number | string | null;
  handleInputChange: (name: string, value: string | number | boolean | null) => void;
  scripts: Script[];
  invalid?: boolean;
}

const NONE_VALUE = "__none__";

export default function SelectScript({
  selectedScript,
  handleInputChange,
  scripts,
  invalid = false,
}: CampaignDetailedSelectScriptProps) {
  const selectedValue =
    selectedScript === null || selectedScript === "" || selectedScript === 0
      ? NONE_VALUE
      : selectedScript.toString();
  const selectedScriptAvailable =
    selectedValue === NONE_VALUE ||
    scripts.some((script) => script?.id.toString() === selectedValue);

  return (
    <FormField label="Script" htmlFor="script_id" className="w-[200px]">
      <Select
        value={selectedValue}
        onValueChange={(value) =>
          handleInputChange("script_id", value === NONE_VALUE ? null : parseInt(value, 10))
        }
      >
        <SelectTrigger
          id="script_id"
          className={cn("w-[200px]", invalid && "border-destructive")}
          aria-invalid={invalid || undefined}
        >
          <SelectValue placeholder="Select script" />
        </SelectTrigger>
        <SelectContent>
          {selectedValue !== NONE_VALUE && !selectedScriptAvailable ? (
            <SelectItem value={selectedValue} disabled>
              Script {selectedValue} — unavailable
            </SelectItem>
          ) : null}
          <SelectItem value={NONE_VALUE}>None</SelectItem>
          {scripts?.map((script) =>
            script ? (
              <SelectItem key={script.id} value={script.id.toString()}>
                {script.name}
              </SelectItem>
            ) : null,
          )}
        </SelectContent>
      </Select>
    </FormField>
  );
}
