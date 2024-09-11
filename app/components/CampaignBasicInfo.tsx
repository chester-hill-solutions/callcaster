import { Button } from "~/components/ui/button";
import { NavLink } from "@remix-run/react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { DateTimePicker } from "~/components/ui/datetime";
import { Flags, WorkspaceNumbers } from "~/lib/types";

export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
  flags,
}: {
  campaignData: any;
  handleInputChange: (name: string, value: string | number) => void;
  phoneNumbers: WorkspaceNumbers[];
  flags: Flags;
}) => {
  const isLiveCallEnabled = flags?.call?.campaign === true;
  const isMessageEnabled = flags?.sms?.campaign === true;
  const isRobocallEnabled = flags?.ivr?.campaign === true;


  return (
    <div className="flex flex-wrap gap-6">
      <div className="min-w-[250px] flex-1 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Campaign Title</Label>
          <Input
            id="title"
            name="title"
            value={campaignData.title}
            onChange={(e) => handleInputChange("title", e.target.value)}
          />
        </div>
        <div className="space-y-2">
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
      </div>
      <div className="min-w-[250px] flex-1 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="type">Campaign Type</Label>
          <Select
            value={campaignData.type}
            onValueChange={(value) => handleInputChange("type", value)}
          >
            <SelectTrigger id="type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {isMessageEnabled && <SelectItem value="message">Message</SelectItem>}
              {isRobocallEnabled && <SelectItem value="robocall">
                Interactive Voice Recording
              </SelectItem>}
              {isLiveCallEnabled && <SelectItem value="live_call">Live Call</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        {phoneNumbers.length ? (
          <div className="space-y-2">
            <Label htmlFor="caller_id">Phone Number</Label>
            <Select
              value={campaignData.caller_id}
              onValueChange={(value) => handleInputChange("caller_id", value)}
            >
              <SelectTrigger id="caller_id">
                <SelectValue placeholder="Select phone number" />
              </SelectTrigger>
              <SelectContent>
                {phoneNumbers.map((number) => (
                  <SelectItem
                    key={number.phone_number}
                    value={number.phone_number}
                  >
                    {number.friendly_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="pt-6">
            <Button asChild>
              <NavLink to="../../../settings/numbers">Get a Number</NavLink>
            </Button>
          </div>
        )}
      </div>
      <div className="min-w-[250px] flex-1 space-y-2">
        <Label htmlFor="start_date">Start Date</Label>
        <DateTimePicker
          value={
            campaignData.start_date
              ? new Date(campaignData.start_date)
              : undefined
          }
          onChange={(date) =>
            handleInputChange("start_date", date?.toISOString())
          }
          hourCycle={24}
        />
      </div>
      <div className="min-w-[250px] flex-1 space-y-2">
        <Label htmlFor="end_date">End Date</Label>
        <DateTimePicker
          value={
            campaignData.end_date ? new Date(campaignData.end_date) : undefined
          }
          onChange={(date) =>
            handleInputChange("end_date", date?.toISOString())
          }
          hourCycle={24}
        />
      </div>
    </div>
  );
};
