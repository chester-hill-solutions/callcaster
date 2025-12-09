import { NavLink } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { WorkspaceNumbers } from "~/lib/types";

interface SelectNumberProps {
  handleInputChange: (name: string, value: string) => void;
  campaignData: {
    caller_id?: string;
  };
  phoneNumbers: WorkspaceNumbers[];
}

export default function SelectNumber({
  handleInputChange,
  campaignData,
  phoneNumbers,
}: SelectNumberProps) {
  if (!phoneNumbers.length) {
    return (
      <Button variant="outline" asChild>
        <NavLink to="../../../settings/numbers">Get a Number</NavLink>
      </Button>
    );
  }

  return (
    <Select
      value={campaignData.caller_id}
      onValueChange={(value) => handleInputChange("caller_id", value)}
    >
      <SelectTrigger id="caller_id">
        <SelectValue placeholder="Select a number" />
      </SelectTrigger>
      <SelectContent>
        {phoneNumbers.map((number) => number?.phone_number && (
          <SelectItem 
            key={number.phone_number} 
            value={number.phone_number}
          >
            {number.friendly_name || number.phone_number}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
