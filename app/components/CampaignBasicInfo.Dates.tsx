import { useState } from "react";
import WeeklyScheduleTable from "./CampaignBasicInfo.Schedule";
import { Button } from "./ui/button";
import { DateTimePicker } from "./ui/datetime";
import { Label } from "./ui/label";
import { days } from "~/lib/utils";
import { Clock } from "lucide-react";
import { CampaignSettingsData } from "./CampaignSettings";
import {
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Schedule,
  Script,
  Weekday,
} from "~/lib/types";
import InfoHover from "./InfoPopover";
import { FetcherWithComponents } from "@remix-run/react";

export default function SelectDates({
  campaignData,
  handleInputChange,
  formFetcher,
  details,
}: {
  campaignData: CampaignSettingsData;
  handleInputChange: (name: string, value: any) => void;
  formFetcher: FetcherWithComponents<CampaignSettingsData>;
  details:
    | ((LiveCampaign | IVRCampaign) & { script: Script })
    | MessageCampaign;
}) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState<Schedule>(
    campaignData?.schedule ||
      Object.fromEntries(
        days.map((day) => [
          day.toLowerCase(),
          {
            active: false,
            intervals: [],
          },
        ]),
      ) ||
      {},
  );

  const utcToLocal = (utcTime) => {
    if (!utcTime) return "";
    const [hours, minutes] = utcTime.split(":");
    const date = new Date();
    date.setUTCHours(hours);
    date.setUTCMinutes(minutes);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const localToUTC = (localTime) => {
    if (!localTime) return "";
    const [hours, minutes] = localTime.split(":");
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(minutes);
    return date.toUTCString().slice(17, 22);
  };

  const handleCheckboxChange = (day:Weekday) => {
    console.log(day)
    const localMidnightUTC = localToUTC("00:00");
    const localEndOfDayUTC = localToUTC("23:59");

    setCurrentSchedule((prev:Schedule) => ({
      ...prev,
      [day.toLowerCase()]: {
        active: !prev[day.toLowerCase()]?.active,
        intervals: prev[day.toLowerCase()]?.active
          ? []
          : [{ start: localMidnightUTC, end: localEndOfDayUTC }],
      },
    }));
  };

  const handleTimeChange = (day:Weekday, field, localValue, index = 0) => {
    const utcValue = localToUTC(localValue);
    setCurrentSchedule((prev) => ({
      ...prev,
      [day.toLowerCase()]: {
        ...prev[day.toLowerCase()],
        intervals: prev[day.toLowerCase()].intervals.map((interval, i) =>
          i === index ? { ...interval, [field]: utcValue } : interval,
        ),
      },
    }));
  };
  const handleSave = () => {
    handleInputChange("schedule", currentSchedule);
    formFetcher.submit(
      {
        campaignData: JSON.stringify({
          ...campaignData,
          schedule: currentSchedule,
        }),
        campaignDetails: JSON.stringify(details),
      },
      {
        method: "patch",
        action: "/api/campaigns",
      },
    );
    setShowSchedule(false);
  };

  const scheduleForDisplay = Object.fromEntries(
    Object.entries(currentSchedule).map(([day, daySchedule]) => [
      day,
      {
        ...daySchedule,
        intervals: daySchedule.intervals.map((interval) => ({
          start: utcToLocal(interval.start),
          end: utcToLocal(interval.end),
        })),
      },
    ]) || {},
  );

  const getScheduleSummary = () => {
    const activeDays = Object.entries(currentSchedule)
      .filter(([, { active }]) => active)
      .map(([day, schedule]) => ({
        day: day.charAt(0).toUpperCase() + day.slice(1),
        time: schedule.intervals[0]
          ? `${utcToLocal(schedule.intervals[0].start)} - ${utcToLocal(schedule.intervals[0].end)}`
          : "All day",
      }));

    if (activeDays.length === 0) return "No calling hours set";
    if (
      activeDays.length === 7 &&
      activeDays.every((day) => day.time === "All day")
    )
      return "24/7";

    return activeDays.map(({ day, time }) => `${day} ${time}`).join(", ");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="">
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
        <div className="">
          <Label htmlFor="end_date">
            End Date
            <InfoHover tooltip="Your campaign will run until your designated end time on this date." />
          </Label>
          <DateTimePicker
            value={
              campaignData.end_date
                ? new Date(campaignData.end_date)
                : undefined
            }
            onChange={(date) =>
              handleInputChange("end_date", date?.toISOString())
            }
            hourCycle={24}
          />
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            onClick={() => setShowSchedule(!showSchedule)}
            className="border-2 border-primary"
          >
            {showSchedule ? "Hide Calling Hours" : "Set Calling Hours"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md bg-gray-100 p-3">
        <Clock className="text-gray-500" size={20} />
        <Label className="font-semibold">Calling Hours:</Label>
        <div className="flex-grow text-sm text-gray-600">
          {getScheduleSummary()}
        </div>
      </div>

      <div className="space-y-4">
        {showSchedule && (
          <div className="rounded-md border p-4">
            <WeeklyScheduleTable
              schedule={scheduleForDisplay}
              handleCheckboxChange={handleCheckboxChange}
              handleTimeChange={handleTimeChange}
            />
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
