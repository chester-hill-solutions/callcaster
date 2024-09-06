import React from "react";
import { TextInput, Dropdown } from "./Inputs";
import { Button } from "./ui/button";
import { NavLink } from "@remix-run/react";
import { DateTimePicker } from "./ui/datetime";

export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
}) => (
  <div className="flex flex-wrap justify-start gap-4">
    <div className="flex flex-col gap-2">
      <TextInput
        name="title"
        label="Campaign Title"
        value={campaignData.title}
        onChange={(e) => handleInputChange("title", e.target.value)}
        className="flex flex-col"
      />
      <Dropdown
        name="status"
        label="Campaign Status"
        value={campaignData.status}
        onChange={(e) => handleInputChange("status", e.target.value)}
        options={[
          { value: "pending", label: "Pending" },
          { value: "running", label: "Running" },
          { value: "complete", label: "Complete" },
          { value: "paused", label: "Paused" },
          { value: "draft", label: "Draft" },
        ]}
        className="flex flex-col"
      />
    </div>
    <div className="flex flex-col gap-2">
      <Dropdown
        name="type"
        disabled
        label="Campaign Type"
        value={campaignData.type}
        onChange={(e) => handleInputChange("type", e.target.value)}
        options={[
          { value: "message", label: "Message" },
          { value: "robocall", label: "Interactive Voice Recording" },
          { value: "live_call", label: "Live Call" },
        ]}
        className="flex flex-col"
      />
      {phoneNumbers.length ? (
        <Dropdown
          name="caller_id"
          className="flex flex-col"
          label="Phone Number"
          value={campaignData.caller_id}
          onChange={(e) => handleInputChange("caller_id", e.target.value)}
          options={phoneNumbers.map((number) => ({
            value: number.phone_number,
            label: number.friendly_name,
          }))}
        />
      ) : (
        <div className="flex flex-col justify-end">
          <Button asChild>
            <NavLink to="../../../settings/numbers">Get a Number</NavLink>
          </Button>
        </div>
      )}
    </div>
    <div className="flex flex-col gap-2">
      <DateTimePicker
        value={campaignData?.start_date as unknown as Date}
        onChange={(e) => handleInputChange("start_date", e)}
      />
    </div>
  </div>
);
