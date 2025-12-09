import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface SelectStatusProps {
  handleInputChange: (name: string, value: string) => void;
  campaignData: {
    status?: string;
  };
}

export default function SelectStatus({ handleInputChange, campaignData }: SelectStatusProps) {
  return (
    <div className="flex flex-grow flex-col gap-1 min-w-48">
      <Label htmlFor="status">Campaign Status</Label>
      <Select
        value={campaignData.status}
        onValueChange={(value) => handleInputChange("status", value)}
      >
        <SelectTrigger id="status">
          <SelectValue placeholder="Select status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="running">Running</SelectItem>
          <SelectItem value="complete">Complete</SelectItem>
          <SelectItem value="paused">Paused</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
