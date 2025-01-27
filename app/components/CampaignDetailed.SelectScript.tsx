import { Label } from "@radix-ui/react-dropdown-menu";
import {
  SelectValue,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "./ui/select";
import { IVRCampaign, MessageCampaign, LiveCampaign, Script, Campaign } from "~/lib/types";

export default function SelectScript({
  selectedScript,
  handleInputChange,
  scripts,
}: {
  selectedScript: number | string;
  handleInputChange: (name: string, value: any) => void;
  scripts: Script[];
}) {
  return (
    <div className="space-y-2">
      <Label >Script</Label>
      <Select
        value={selectedScript.toString()}
        onValueChange={(value) =>
          handleInputChange("script_id", parseInt(value))
        }
      >
        <SelectTrigger id="script_id" className="w-[200px]">
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
    </div>
  );
}
