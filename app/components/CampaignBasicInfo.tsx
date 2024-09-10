import React from "react";
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
import { TimePicker } from "~/components/ui/datetime";
import { Checkbox } from "~/components/ui/checkbox";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
}) => {
  const handleScheduleChange = (day, field, value) => {
    const newSchedule = { ...campaignData.schedule };
    if (!newSchedule[day]) {
      newSchedule[day] = { active: true, start: "17:00", end: "20:00" };
    }
    newSchedule[day][field] = value;
    console.log(day, field, value)
    handleInputChange("schedule", newSchedule);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="flex items-center">
              Campaign Title
            </Label>
            <Input
              id="title"
              name="title"
              value={campaignData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder="Enter campaign title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type" className="flex items-center">
              Campaign Type
            </Label>
            <Select
              value={campaignData.type}
              onValueChange={(value) => handleInputChange("type", value)}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="message">Message</SelectItem>
                <SelectItem value="robocall">
                  Interactive Voice Recording
                </SelectItem>
                <SelectItem value="live_call">Live Call</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="status" className="flex items-center">
              Campaign Status
            </Label>
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
          {phoneNumbers.length ? (
            <div className="space-y-2">
              <Label htmlFor="caller_id" className="flex items-center">
                Phone Number
              </Label>
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
            <div className="space-y-2">
              <Label className="flex items-center">Phone Number</Label>
              <Button asChild variant="outline" className="w-full">
                <NavLink to="../../../settings/numbers">Get a Number</NavLink>
              </Button>
            </div>
          )}
        </div>
        <div className="col-span-2 space-y-4">
          <Label className="text-lg font-semibold">Campaign Schedule</Label>
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="flex items-center space-x-4">
              <Checkbox
                id={`${day}-active`}
                checked={campaignData.schedule?.[day]?.active || false}
                onCheckedChange={(checked) =>
                  handleScheduleChange(day, "active", checked)
                }
              />
              <Label htmlFor={`${day}-active`}>{day}</Label>
              <TimePicker
                value={campaignData.schedule?.[day]?.start || "17:00"}
                onChange={(time) => handleScheduleChange(day, "start", time)}
                disabled={!campaignData.schedule?.[day]?.active}
              />
              <span>to</span>
              <TimePicker
                value={campaignData.schedule?.[day]?.end || "20:00"}
                onChange={(time) => handleScheduleChange(day, "end", time)}
                disabled={!campaignData.schedule?.[day]?.active}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CampaignBasicInfo;
