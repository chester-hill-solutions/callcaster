import { Text } from "@/components/ui/typography";
import { WEEKDAY_KEYS, type WeekdayKey } from "@/lib/schedule-intervals";
import { utcToWallClockHm } from "@/lib/schedule-timezone";
import type { ScheduleDay, ScheduleInterval } from "@/lib/types";

const DISPLAY_DAYS = [...WEEKDAY_KEYS.slice(1), WEEKDAY_KEYS[0]];

type ScheduleGroup = {
  days: WeekdayKey[];
  active: boolean;
  intervals: ScheduleInterval[];
};

function intervalCoversFullDay(interval: ScheduleInterval): boolean {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours !== undefined && minutes !== undefined && Number.isFinite(hours) && Number.isFinite(minutes)
      ? hours * 60 + minutes
      : null;
  };
  const start = toMinutes(interval.start);
  const end = toMinutes(interval.end);
  return start !== null && end !== null && (end - start + 1440) % 1440 >= 1439;
}

export function ScheduleSummary({
  schedule,
  timeZone,
  emptyLabel,
}: {
  schedule: Record<WeekdayKey, ScheduleDay>;
  timeZone: string;
  emptyLabel: string;
}) {
  if (!DISPLAY_DAYS.some((day) => schedule[day].active)) {
    return <Text variant="muted">{emptyLabel}</Text>;
  }

  const groups = new Map<string, ScheduleGroup>();
  for (const day of DISPLAY_DAYS) {
    const { active, intervals } = schedule[day];
    const ordered = active
      ? [...intervals].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
      : [];
    const key = JSON.stringify([active, ordered]);
    const group = groups.get(key);
    if (group) group.days.push(day);
    else groups.set(key, { days: [day], active, intervals: ordered });
  }

  return (
    <dl className="space-y-1" aria-label="Weekly schedule summary">
      {[...groups.entries()].map(([key, group]) => (
        <div key={key} className="flex flex-wrap gap-x-2">
          <dt>
            <Text as="span">
              {group.days.length === 7
                ? "Every day"
                : group.days.map((day) => day.charAt(0).toUpperCase() + day.slice(1)).join(", ")}:
            </Text>
          </dt>
          <dd>
            <Text as="span" variant="muted">
              {!group.active
                ? "Inactive"
                : group.intervals.length === 0
                  ? "No intervals set"
                  : group.intervals.map((interval) => intervalCoversFullDay(interval)
                    ? "All day"
                    : `${utcToWallClockHm(interval.start, timeZone)}–${utcToWallClockHm(interval.end, timeZone)}`,
                  ).join(", ")}
            </Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}
