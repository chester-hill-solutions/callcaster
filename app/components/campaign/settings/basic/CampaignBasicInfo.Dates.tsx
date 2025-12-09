import { useEffect, useState } from "react";
import WeeklyScheduleTable from "./CampaignBasicInfo.Schedule";
import { Button } from "~/components/ui/button";
import { DateTimePicker } from "~/components/ui/datetime";
import { Label } from "~/components/ui/label";
import { Clock } from "lucide-react";
import {
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Schedule,
  ScheduleDay,
  ScheduleInterval,
  Script,
} from "~/lib/types";
import { FetcherWithComponents, useSubmit } from "@remix-run/react";

type DayName = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const WEEKDAYS: DayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAYS_OF_WEEK: DayName[] = [...WEEKDAYS, 'saturday', 'sunday'];

interface SelectDatesProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | null) => void;
}

export default function SelectDates({
  campaignData,
  handleInputChange,
}: SelectDatesProps) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState<Record<DayName, ScheduleDay>>(() => {
    const defaultSchedule = {
      monday: { active: false, intervals: [] },
      tuesday: { active: false, intervals: [] },
      wednesday: { active: false, intervals: [] },
      thursday: { active: false, intervals: [] },
      friday: { active: false, intervals: [] },
      saturday: { active: false, intervals: [] },
      sunday: { active: false, intervals: [] },
    };

    if (!campaignData?.schedule) return defaultSchedule;

    try {
      if (typeof campaignData.schedule === 'string') {
        return JSON.parse(campaignData.schedule);
      }
      return campaignData.schedule;
    } catch (e) {
      console.error('Error parsing schedule:', e);
      return defaultSchedule;
    }
  });

  const utcToLocal = (utcTime: string) => {
    if (!utcTime) return "";
    const [hours, minutes] = utcTime.split(":");
    const date = new Date();
    date.setUTCHours(Number(hours));
    date.setUTCMinutes(Number(minutes));
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const localToUTC = (localTime: string) => {
    if (!localTime) return "";
    const [hours, minutes] = localTime.split(":");
    const date = new Date();
    date.setHours(Number(hours));
    date.setMinutes(Number(minutes));
    return date.toUTCString().slice(17, 22);
  };

  const applyScheduleToAll = (schedule: { start: string; end: string }) => {
    setCurrentSchedule((prev) => {
      const newSchedule: Record<DayName, ScheduleDay> = { ...prev };
      DAYS_OF_WEEK.forEach((day) => {
        newSchedule[day] = {
          active: true,
          intervals: [schedule],
        };
      });
      return newSchedule;
    });
  };

  const applyScheduleToWeekdays = (schedule: { start: string; end: string }) => {
    setCurrentSchedule((prev) => {
      const newSchedule: Record<DayName, ScheduleDay> = { ...prev };
      WEEKDAYS.forEach((day) => {
        newSchedule[day] = {
          active: true,
          intervals: [schedule],
        };
      });
      return newSchedule;
    });
  };

  const handleCheckboxChange = (day: DayName) => {
    const localMidnightUTC = localToUTC("00:00");
    const localEndOfDayUTC = localToUTC("23:59");
    const schedule = { start: localMidnightUTC, end: localEndOfDayUTC };

    setCurrentSchedule((prev) => {
      const newSchedule: Record<DayName, ScheduleDay> = {
        ...prev,
        [day]: {
          active: !prev[day]?.active,
          intervals: prev[day]?.active ? [] : [schedule],
        },
      };
      return newSchedule;
    });
  };

  const handleTimeChange = (
    day: DayName,
    field: 'start' | 'end',
    localValue: string,
    index = 0
  ) => {
    const utcValue = localToUTC(localValue);
    setCurrentSchedule((prev) => {
      const daySchedule: ScheduleDay = prev[day] || { active: true, intervals: [{ start: "00:00", end: "23:59" }] };
      
      const intervals = daySchedule.intervals.length === 0 
        ? [{ start: "00:00", end: "23:59" }]
        : daySchedule.intervals;

      const newSchedule: Record<DayName, ScheduleDay> = {
        ...prev,
        [day]: {
          ...daySchedule,
          intervals: intervals.map((interval: ScheduleInterval, i: number) =>
            i === index ? { ...interval, [field]: utcValue } : interval
          ),
        },
      };
      return newSchedule;
    });
  };

  const handleSave = () => {
    // Remove any extra properties that might have been added
    const cleanSchedule = DAYS_OF_WEEK.reduce((acc, day) => ({
      ...acc,
      [day]: {
        active: currentSchedule[day].active,
        intervals: currentSchedule[day].intervals.map((interval: ScheduleInterval) => ({
          start: interval.start,
          end: interval.end
        }))
      }
    }), {} as Record<DayName, ScheduleDay>);
    
    // Convert to a JSONB-compatible string for Supabase
    handleInputChange("schedule", JSON.stringify(cleanSchedule));
    setShowSchedule(false);
  };

  const scheduleForDisplay: Record<DayName, ScheduleDay> = {
    monday: transformDaySchedule(currentSchedule.monday),
    tuesday: transformDaySchedule(currentSchedule.tuesday),
    wednesday: transformDaySchedule(currentSchedule.wednesday),
    thursday: transformDaySchedule(currentSchedule.thursday),
    friday: transformDaySchedule(currentSchedule.friday),
    saturday: transformDaySchedule(currentSchedule.saturday),
    sunday: transformDaySchedule(currentSchedule.sunday),
  };

  function transformDaySchedule(daySchedule: ScheduleDay | undefined): ScheduleDay {
    if (!daySchedule) {
      return { active: false, intervals: [] };
    }
    return {
      ...daySchedule,
      intervals: daySchedule.intervals?.map((interval: ScheduleInterval) => ({
        start: utcToLocal(interval.start),
        end: utcToLocal(interval.end),
      })) || [],
    };
  }

  const getScheduleSummary = () => {
    const activeDays = DAYS_OF_WEEK
      .map(day => ({
        day,
        schedule: currentSchedule[day]
      }))
      .filter(({ schedule }) => schedule?.active)
      .map(({ day, schedule }) => ({
        day: day.charAt(0).toUpperCase() + day.slice(1),
        time: schedule?.intervals?.[0]
          ? `${utcToLocal(schedule.intervals[0].start)} - ${utcToLocal(schedule.intervals[0].end)}`
          : "All day",
      }));

    if (!activeDays?.length) return "No calling hours set";
    if (activeDays.length === 7 && activeDays.every((day) => day.time === "All day"))
      return "24/7";

    return (
      <ul className="space-y-1 list-disc pl-4">
        {activeDays.map(({ day, time }) => (
          <li key={day} className="text-sm">
            <span className="font-medium">{day}:</span> {time}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Start Date & Time</Label>
          <DateTimePicker
            value={
              campaignData.start_date
                ? new Date(campaignData.start_date)
                : undefined
            }
            onChange={(date) =>
              handleInputChange("start_date", date ? date.toISOString() : null)
            }
            hourCycle={24}
          />
        </div>
        <div className="space-y-2">
          <Label>End Date & Time</Label>
          <DateTimePicker
            value={
              campaignData.end_date
                ? new Date(campaignData.end_date)
                : undefined
            }
            onChange={(date) =>
              handleInputChange("end_date", date ? date.toISOString() : null)
            }
            hourCycle={24}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="text-gray-500" size={20} />
            <Label className="font-semibold">Calling Hours</Label>
          </div>
          <Button
            variant="outline"
            onClick={(e) => {
              e.preventDefault();
              setShowSchedule(!showSchedule)
            }}
            size="sm"
          >
            {showSchedule ? "Hide Calling Hours" : "Set Calling Hours"}
          </Button>
        </div>

        <div className="rounded-md bg-gray-100 p-4">
          {getScheduleSummary()}
        </div>

        {showSchedule && (
          <div className="rounded-md border p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  applyScheduleToAll({ start: localToUTC("09:00"), end: localToUTC("17:00") })
                }}
              >
                Apply 9-5 to All Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  applyScheduleToWeekdays({ start: localToUTC("09:00"), end: localToUTC("17:00") })
                }}
              >
                Apply 9-5 to Weekdays
              </Button>
            </div>
            <WeeklyScheduleTable
              schedule={scheduleForDisplay}
              handleCheckboxChange={handleCheckboxChange}
              handleTimeChange={handleTimeChange}
            />
            <div className="flex justify-end">
              <Button onClick={handleSave}>Save Calling Hours</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}