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
  selectedScript: number | string;
  handleInputChange: (name: string, value: string | number | boolean) => void;
  scripts: Script[];
  invalid?: boolean;
}

export default function SelectScript({
  selectedScript,
  handleInputChange,
  scripts,
  invalid = false,
}: CampaignDetailedSelectScriptProps) {
  return (
    <FormField label="Script" htmlFor="script_id" className="w-[200px]">
      <Select
        value={selectedScript?.toString()}
        onValueChange={(value) =>
          handleInputChange("script_id", parseInt(value))
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
          {scripts?.map((script) => script && (
            <SelectItem key={script.id} value={script.id.toString()}>
              {script.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
