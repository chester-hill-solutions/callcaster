import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkspaceNumbers } from "@/lib/types";

interface SelectNumberProps {
  handleInputChange: (name: string, value: string | null) => void;
  campaignData: {
    caller_id?: string;
  };
  phoneNumbers: WorkspaceNumbers[];
  callerIdOptional?: boolean;
}

const NONE_VALUE = "__none__";

export default function SelectNumber({
  handleInputChange,
  campaignData,
  phoneNumbers,
  callerIdOptional = false,
}: SelectNumberProps) {
  const configuredCallerId = campaignData.caller_id?.trim() || null;
  const callerIdAvailable = configuredCallerId
    ? phoneNumbers.some((number) => number?.phone_number === configuredCallerId)
    : true;

  if (!phoneNumbers.length && !configuredCallerId) {
    return (
      <FormField label="Outbound number">
        <Button variant="outline" asChild>
          <NavLink to="../../../settings/numbers/purchase">Get a Number</NavLink>
        </Button>
      </FormField>
    );
  }

  const selectValue =
    campaignData.caller_id && campaignData.caller_id.length > 0
      ? campaignData.caller_id
      : callerIdOptional
        ? NONE_VALUE
        : undefined;

  return (
    <FormField label="Outbound number" htmlFor="caller_id">
      <Select
        value={selectValue}
        onValueChange={(value) =>
          handleInputChange("caller_id", value === NONE_VALUE ? null : value)
        }
      >
        <SelectTrigger id="caller_id">
          <SelectValue placeholder="Select a number" />
        </SelectTrigger>
        <SelectContent>
          {configuredCallerId && !callerIdAvailable ? (
            <SelectItem value={configuredCallerId} disabled>
              {configuredCallerId} — unavailable
            </SelectItem>
          ) : null}
          {callerIdOptional ? (
            <SelectItem value={NONE_VALUE}>None (Messaging Service only)</SelectItem>
          ) : null}
          {phoneNumbers.map((number) =>
            number?.phone_number ? (
              <SelectItem key={number.phone_number} value={number.phone_number}>
                {number.friendly_name || number.phone_number}
              </SelectItem>
            ) : null,
          )}
        </SelectContent>
      </Select>
    </FormField>
  );
}
