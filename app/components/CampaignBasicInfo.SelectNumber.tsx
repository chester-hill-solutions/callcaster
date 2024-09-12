import { NavLink } from "@remix-run/react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export default function SelectNumber({
  handleInputChange,
  campaignData,
  phoneNumbers,
}) {
  return (
    <div className="gap-1 flex flex-grow flex-col min-w-48">
      <Label htmlFor="caller_id">Phone Number</Label>
      {phoneNumbers.length ? (
        <Select
          value={campaignData.caller_id}
          onValueChange={(value) => handleInputChange("caller_id", value)}
        >
          <SelectTrigger id="caller_id">
            <SelectValue placeholder="Select phone number" />
          </SelectTrigger>
          <SelectContent>
            {phoneNumbers.map((number) => (
              <SelectItem key={number.phone_number} value={number.phone_number}>
                {number.friendly_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button asChild>
          <NavLink to="../../../settings/numbers">Get a Number</NavLink>
        </Button>
      )}
    </div>
  );
}
