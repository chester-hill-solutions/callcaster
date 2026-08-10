import { useState } from "react";
import WeeklyScheduleTable from "./CampaignBasicInfo.Schedule";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/datetime";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";
import { logger } from "@/lib/logger.client";
import {
  Campaign,
  ScheduleDay,
  ScheduleInterval,
} from "@/lib/types";
import {
  wallClockToUtcHm,
  utcToWallClockHm,
} from "@/lib/schedule-timezone";

// Schedule type matching the WeeklyScheduleTable component
type DayName = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

interface TimeInterval {
  start: string;
  end: string;
}

interface Day {
  active: boolean;
  intervals: TimeInterval[];
}

type Schedule = Record<DayName, Day>;

const WEEKDAYS: DayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAYS_OF_WEEK: DayName[] = [...WEEKDAYS, 'saturday', 'sunday'];

interface SelectDatesProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | null) => void;
}

function getDefaultSchedule(): Record<DayName, ScheduleDay> {
  return {
    monday: { active: false, intervals: [] },
    tuesday: { active: false, intervals: [] },
    wednesday: { active: false, intervals: [] },
    thursday: { active: false, intervals: [] },
    friday: { active: false, intervals: [] },
    saturday: { active: false, intervals: [] },
    sunday: { active: false, intervals: [] },
  };
}

function parseSchedule(schedule: Campaign["schedule"]): Record<DayName, ScheduleDay> {
  if (!schedule) return getDefaultSchedule();

  try {
    const parsedSchedule =
      typeof schedule === "string"
        ? JSON.parse(schedule)
        : schedule;
    const normalizedSchedule = getDefaultSchedule();

    DAYS_OF_WEEK.forEach((day) => {
      const daySchedule = parsedSchedule?.[day];

      if (!daySchedule || typeof daySchedule !== "object" || !("active" in daySchedule)) {
        return;
      }

      normalizedSchedule[day] = {
        active: Boolean(daySchedule.active),
        intervals: Array.isArray(daySchedule.intervals)
          ? daySchedule.intervals
              .filter(
                (interval: unknown): interval is ScheduleInterval =>
                  Boolean(interval) &&
                  typeof interval === "object" &&
                  interval !== null &&
                  "start" in interval &&
                  "end" in interval &&
                  typeof interval.start === "string" &&
                  typeof interval.end === "string",
              )
              .map((interval: ScheduleInterval) => ({
                start: interval.start,
                end: interval.end,
              }))
          : [],
      };
    });

    return normalizedSchedule;
  } catch (error) {
    logger.error("Error parsing schedule:", error);
    return getDefaultSchedule();
  }
}

/**
 * SMS campaigns dispatch messages rather than dial, so the same weekly editor
 * is presented as a "send window". Message campaigns persist
 * `campaign.sms_send_window` (server-enforced); voice campaigns keep
 * `campaign.schedule` (calling hours).
 */
const SCHEDULE_COPY = {
  call: {
    label: "Calling Hours",
    show: "Edit",
    hide: "Hide",
    empty: "No calling hours set",
    endTooltip: "The latest time to begin dialing.",
    field: "schedule" as const,
  },
  message: {
    label: "Send Window",
    show: "Edit",
    hide: "Hide",
    empty: "No send window set",
    endTooltip: "The latest time to send messages.",
    field: "sms_send_window" as const,
  },
} as const;

function cleanScheduleForPersist(
  schedule: Record<DayName, ScheduleDay>,
): Record<DayName, ScheduleDay> {
  return DAYS_OF_WEEK.reduce(
    (acc, day) => ({
      ...acc,
      [day]: {
        active: schedule[day].active,
        intervals: schedule[day].intervals.map((interval: ScheduleInterval) => ({
          start: interval.start,
          end: interval.end,
        })),
      },
    }),
    {} as Record<DayName, ScheduleDay>,
  );
}

function scheduleSourceForCampaign(campaignData: Campaign): unknown {
  return campaignData.type === "message"
    ? (campaignData as Campaign & { sms_send_window?: unknown }).sms_send_window
    : campaignData.schedule;
}

export default function SelectDates({
  campaignData,
  handleInputChange,
}: SelectDatesProps) {
  const copy =
    campaignData.type === "message" ? SCHEDULE_COPY.message : SCHEDULE_COPY.call;
  const [showSchedule, setShowSchedule] = useState(false);
  const scheduleSource = scheduleSourceForCampaign(campaignData);
  const [currentSchedule, setCurrentSchedule] = useState<Record<DayName, ScheduleDay>>(() =>
    parseSchedule(scheduleSource as Campaign["schedule"]),
  );
  const [prevScheduleSource, setPrevScheduleSource] = useState(scheduleSource);
  if (prevScheduleSource !== scheduleSource) {
    setPrevScheduleSource(scheduleSource);
    setCurrentSchedule(parseSchedule(scheduleSource as Campaign["schedule"]));
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const utcToLocal = (utcTime: string) =>
    utcToWallClockHm(utcTime, timeZone);

  const localToUTC = (localTime: string) =>
    wallClockToUtcHm(localTime, timeZone);

  function intervalsWithoutTies(intervals: ScheduleInterval[]): ScheduleInterval[] {
    return intervals.filter((iv) => iv.start !== iv.end);
  }

  const commitSchedule = (next: Record<DayName, ScheduleDay>) => {
    const cleaned = cleanScheduleForPersist(next);
    // Strip any interval where start === end (no-op range that would always
    // make checkSchedule return false).
    for (const day of DAYS_OF_WEEK) {
      cleaned[day].intervals = intervalsWithoutTies(cleaned[day].intervals);
    }
    setCurrentSchedule(cleaned);
    handleInputChange(copy.field, JSON.stringify(cleaned));
  };

  const applyScheduleToAll = (schedule: { start: string; end: string }) => {
    const iv = schedule.start !== schedule.end ? [schedule] : [];
    const newSchedule: Record<DayName, ScheduleDay> = { ...currentSchedule };
    DAYS_OF_WEEK.forEach((day) => {
      newSchedule[day] = {
        active: iv.length > 0,
        intervals: iv,
      };
    });
    commitSchedule(newSchedule);
  };

  const applyScheduleToWeekdays = (schedule: { start: string; end: string }) => {
    const iv = schedule.start !== schedule.end ? [schedule] : [];
    const newSchedule: Record<DayName, ScheduleDay> = { ...currentSchedule };
    WEEKDAYS.forEach((day) => {
      newSchedule[day] = {
        active: iv.length > 0,
        intervals: iv,
      };
    });
    commitSchedule(newSchedule);
  };

  const handleCheckboxChange = (day: DayName) => {
    // Newly enabled days default to weekday business hours (local 09:00–17:00).
    const businessHours = {
      start: localToUTC("09:00"),
      end: localToUTC("17:00"),
    };

    commitSchedule({
      ...currentSchedule,
      [day]: {
        active: !currentSchedule[day]?.active,
        intervals: currentSchedule[day]?.active ? [] : [businessHours],
      },
    });
  };

  const handleTimeChange = (
    day: DayName,
    field: 'start' | 'end',
    localValue: string,
    index = 0
  ) => {
    const utcValue = localToUTC(localValue);
    const businessHours = {
      start: localToUTC("09:00"),
      end: localToUTC("17:00"),
    };
    const daySchedule: ScheduleDay = currentSchedule[day] || {
      active: true,
      intervals: [businessHours],
    };

    const intervals =
      daySchedule.intervals.length === 0
        ? [businessHours]
        : daySchedule.intervals;

    commitSchedule({
      ...currentSchedule,
      [day]: {
        ...daySchedule,
        intervals: intervals.map((interval: ScheduleInterval, i: number) =>
          i === index ? { ...interval, [field]: utcValue } : interval
        ),
      },
    });
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

  // A stored interval that spans the whole day (e.g. 00:00–23:59) still spans
  // the whole day after the UTC→local shift; render it as "All day" instead of
  // a wrapped range like "20:00 - 19:59".
  const intervalCoversFullDay = (interval: ScheduleInterval) => {
    const toMinutes = (time: string) => {
      const parts = time.split(":");
      const hours = Number(parts[0]);
      const minutes = Number(parts[1]);
      return Number.isFinite(hours) && Number.isFinite(minutes)
        ? hours * 60 + minutes
        : null;
    };
    const start = toMinutes(interval.start);
    const end = toMinutes(interval.end);
    if (start === null || end === null) return false;
    return (end - start + 1440) % 1440 >= 1439;
  };

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
          ? intervalCoversFullDay(schedule.intervals[0])
            ? "All day"
            : `${utcToLocal(schedule.intervals[0].start)} - ${utcToLocal(schedule.intervals[0].end)}`
          : "All day",
      }));

    if (!activeDays?.length) return copy.empty;
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
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
            showIcon={false}
          />
        </div>
        <div className="min-w-0 space-y-2">
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
            showIcon={false}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="shrink-0 text-muted-foreground" size={20} />
            <Label className="font-semibold">{copy.label}</Label>
          </div>
          <Button
            variant="outline"
            onClick={(e) => {
              e.preventDefault();
              setShowSchedule(!showSchedule)
            }}
            size="sm"
            aria-label={showSchedule ? `Hide ${copy.label}` : `Edit ${copy.label}`}
            aria-expanded={showSchedule}
          >
            {showSchedule ? copy.hide : copy.show}
          </Button>
        </div>

        {!showSchedule && (
          <div className="rounded-md bg-brand-secondary/40 p-4 dark:bg-brand-secondary/15">
            {getScheduleSummary()}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Times are shown in your local time zone (
          {Intl.DateTimeFormat().resolvedOptions().timeZone}). Regardless of
          the hours set here, contacts are only dialed or messaged between
          8:00&nbsp;a.m. and 9:00&nbsp;p.m. in their own time zone, based on
          their phone number&apos;s area code.
        </p>

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
                Apply 09:00–17:00 local to All Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  applyScheduleToWeekdays({ start: localToUTC("09:00"), end: localToUTC("17:00") })
                }}
              >
                Apply 09:00–17:00 local to Weekdays
              </Button>
            </div>
            <WeeklyScheduleTable
              schedule={scheduleForDisplay}
              handleCheckboxChange={handleCheckboxChange}
              handleTimeChange={handleTimeChange}
              endTooltip={copy.endTooltip}
            />
          </div>
        )}
      </div>
    </div>
  );
}