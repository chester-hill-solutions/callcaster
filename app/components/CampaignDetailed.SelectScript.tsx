import { Label } from "@radix-ui/react-dropdown-menu";
import {
  SelectValue,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "./ui/select";

export default function SelectScript({
  campaignData,
  handleInputChange,
  scripts,
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="script_id">Script</Label>
      <Select
        value={campaignData.script_id?.toString()}
        onValueChange={(value) =>
          handleInputChange("script_id", parseInt(value))
        }
      >
        <SelectTrigger id="script_id" className="w-[200px]">
          <SelectValue placeholder="Select script" />
        </SelectTrigger>
        <SelectContent>
          {scripts?.map((script) => (
            <SelectItem key={script.id} value={script.id.toString()}>
              {script.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
