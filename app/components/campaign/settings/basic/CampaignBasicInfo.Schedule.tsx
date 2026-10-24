import { browserTimeZone } from "@/lib/schedule-timezone";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, FormFieldControl } from "@/components/ui/form-field";
import { days } from "@/lib/utils";
import InfoPopover from "@/components/shared/InfoPopover";

interface TimeInterval {
  start: string; // Format: "HH:mm"
  end: string; // Format: "HH:mm"
}
interface Day {
  active: boolean;
  intervals: TimeInterval[];
}
type DayName =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type Schedule = Record<DayName, Day>;

/**
 * One time column's cell. The Start and End columns differ only by field, time
 * and hint, so both render through this — a second hand-rolled copy is how the
 * two drift apart (the fine DRY dimension flagged the pair at 49 tokens).
 */
const TimeCell = ({
  dayName,
  label,
  field,
  value,
  description,
  disabled,
  onTimeChange,
}: {
  dayName: string;
  label: string;
  field: "start" | "end";
  value: string;
  description: string;
  disabled: boolean;
  onTimeChange: (localValue: string) => void;
}) => (
  <TableCell>
    <FormField
      htmlFor={`${dayName}-${field}`}
      label={label}
      description={description}
      className="contents [&>label]:sr-only [&>p]:sr-only"
    >
      <div className="contents">
        <FormFieldControl>
          <input
            name={`${dayName}-${field}`}
            id={`${dayName}-${field}`}
            type="time"
            className="rounded border p-1"
            value={value}
            onChange={(e) => onTimeChange(e.target.value)}
            disabled={disabled}
          />
        </FormFieldControl>
      </div>
    </FormField>
  </TableCell>
);

const WeeklyScheduleTable = ({
  schedule,
  handleCheckboxChange,
  handleTimeChange,
  endTooltip = "The latest time to begin dialing.",
}: {
  schedule: Schedule;
  handleCheckboxChange: (day: DayName) => void;
  handleTimeChange: (
    day: DayName,
    field: "start" | "end",
    localValue: string,
    index: number,
  ) => void;
  /** Channel-specific hint for the End column ("dialing" vs "sending"). */
  endTooltip?: string;
}) => {
  const timeZone = browserTimeZone();
  const timeZoneDescription = `Times are shown in your local time zone (${timeZone}).`;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Day</TableHead>
          <TableHead>Active</TableHead>
          <TableHead>Start ({timeZone})</TableHead>
          <TableHead>
            End ({timeZone}) <InfoPopover tooltip={endTooltip} />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((day) => {
          const dayName = day.toLowerCase() as DayName;
          const intervals = schedule[dayName]?.intervals?.[0];
          const disabled = !schedule[dayName]?.active;
          return (
            <TableRow key={day}>
              <TableCell>{day}</TableCell>
              <TableCell>
                <Checkbox
                  aria-label={`${day} active`}
                  checked={schedule[dayName]?.active}
                  onCheckedChange={() => {
                    handleCheckboxChange(dayName);
                  }}
                />
              </TableCell>
              <TimeCell
                dayName={dayName}
                label={`${day} start time`}
                field="start"
                value={intervals?.start || ""}
                description={timeZoneDescription}
                disabled={disabled}
                onTimeChange={(localValue) =>
                  handleTimeChange(dayName, "start", localValue, 0)
                }
              />
              <TimeCell
                dayName={dayName}
                label={`${day} end time`}
                field="end"
                value={intervals?.end || ""}
                description={`${timeZoneDescription} ${endTooltip}`}
                disabled={disabled}
                onTimeChange={(localValue) =>
                  handleTimeChange(dayName, "end", localValue, 0)
                }
              />
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default WeeklyScheduleTable;
