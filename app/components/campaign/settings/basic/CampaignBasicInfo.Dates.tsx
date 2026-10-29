import { useState } from "react";
import WeeklyScheduleTable from "./CampaignBasicInfo.Schedule";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/datetime";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/shared/Section";
import { ScheduleSummary } from "./CampaignBasicInfo.ScheduleSummary";
import { logger } from "@/lib/logger.client";
import {
  Campaign,
  ScheduleDay,
  ScheduleInterval,
} from "@/lib/types";
import {
  wallClockToUtcHm,
  utcToWallClockHm,
  DEFAULT_CALLING_HOURS,
  DEFAULT_CALLING_HOURS_LABEL,
  browserTimeZone,
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

  const timeZone = browserTimeZone();

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
  const defaultHoursUtc = () => ({
    start: localToUTC(DEFAULT_CALLING_HOURS.start),
    end: localToUTC(DEFAULT_CALLING_HOURS.end),
  });

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
    // Newly enabled days get the product default calling hours (local).
    const businessHours = defaultHoursUtc();

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
    const businessHours = defaultHoursUtc();
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
        <SectionHeader
          compact
          title={copy.label}
          actions={
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
          }
        />

        {!showSchedule && (
          <ScheduleSummary
            schedule={currentSchedule}
            timeZone={timeZone}
            emptyLabel={copy.empty}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Times are shown in your local time zone (
          {browserTimeZone()}). Regardless of
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
                  applyScheduleToAll(defaultHoursUtc())
                }}
              >
                Apply {DEFAULT_CALLING_HOURS_LABEL} local to All Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  applyScheduleToWeekdays(defaultHoursUtc())
                }}
              >
                Apply {DEFAULT_CALLING_HOURS_LABEL} local to Weekdays
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