import { useState } from "react";
import WeeklyScheduleTable from "./CampaignBasicInfo.Schedule";
import { Button } from "./ui/button";
import { DateTimePicker } from "./ui/datetime";
import { Label } from "./ui/label";
import { days } from "~/lib/utils";
import { Clock } from "lucide-react";
import { CampaignSettingsProps } from "./CampaignSettings";

type ScheduleInterval = {
  start: string;
  end: string;
}

type Schedule = {
  "sunday": {active: boolean, intervals: ScheduleInterval[]}
  "monday": {active: boolean, intervals: ScheduleInterval[]}
  "tuesday": {active: boolean, intervals: ScheduleInterval[]}
  "wednesday": {active: boolean, intervals: ScheduleInterval[]}
  "thursday": {active: boolean, intervals: ScheduleInterval[]}
  "friday": {active: boolean, intervals: ScheduleInterval[]}
  "saturday": {active: boolean, intervals: ScheduleInterval[]}
}

export default function SelectDates({ campaignData, handleInputChange }:{campaignData: CampaignSettingsProps, handleInputChange:() => void}) {
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
        ])
      ) || {}
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

  const handleCheckboxChange = (day) => {
    const localMidnightUTC = localToUTC('00:00');
    const localEndOfDayUTC = localToUTC('23:59');
  
    setCurrentSchedule((prev) => ({
      ...prev,
      [day.toLowerCase()]: {
        active: !prev[day.toLowerCase()]?.active,
        intervals: prev[day.toLowerCase()]?.active
          ? []
          : [{ start: localMidnightUTC, end: localEndOfDayUTC }],
      },
    }));
  };

  const handleTimeChange = (day, field, localValue, index = 0) => {
    const utcValue = localToUTC(localValue);
    setCurrentSchedule((prev) => ({
      ...prev,
      [day.toLowerCase()]: {
        ...prev[day.toLowerCase()],
        intervals: prev[day.toLowerCase()].intervals.map(
          (interval, i) =>
            i === index ? { ...interval, [field]: utcValue } : interval
        ),
      },
    }));
  };
  const handleSave = () => {
    handleInputChange("schedule", currentSchedule);
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
    ]) || {}
  );

  const getScheduleSummary = () => {
    const activeDays = Object.entries(currentSchedule)
      .filter(([, { active }]) => active)
      .map(([day, schedule]) => ({
        day: day.charAt(0).toUpperCase() + day.slice(1),
        time: schedule.intervals[0] ? 
          `${utcToLocal(schedule.intervals[0].start)} - ${utcToLocal(schedule.intervals[0].end)}` : 
          'All day'
      }));
    
    if (activeDays.length === 0) return "No calling hours set";
    if (activeDays.length === 7 && activeDays.every(day => day.time === 'All day')) return "24/7";
    
    return activeDays.map(({ day, time }) => `${day} ${time}`).join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
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
        <div className="flex items-end">
          <Button
            variant="outline"
            onClick={() => setShowSchedule(!showSchedule)}
            className="border-primary border-2"
          >
            {showSchedule ? "Hide Calling Hours" : "Set Calling Hours"}
          </Button>
        </div>
      </div>
      
      <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-md">
        <Clock className="text-gray-500" size={20} />
        <Label className="font-semibold">Calling Hours:</Label>
        <div className="text-sm text-gray-600 flex-grow">{getScheduleSummary()}</div>
      </div>
      
      <div className="space-y-4">
        {showSchedule && (
          <div className="border p-4 rounded-md">
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