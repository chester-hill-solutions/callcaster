import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { days } from "@/lib/utils";
import InfoHover from "@/components/shared/InfoPopover";

interface TimeInterval {
  start: string; // Format: "HH:mm"
  end: string;   // Format: "HH:mm"
}
interface Day {
  active: boolean;
  intervals: TimeInterval[];
}
type DayName = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

type Schedule = Record<DayName, Day>;


const WeeklyScheduleTable = ({ schedule, handleCheckboxChange, handleTimeChange }: {
  schedule: Schedule,
  handleCheckboxChange: (day: DayName) => void;
  handleTimeChange: (day: DayName, field: "start" | "end", localValue: string, index: number) => void;
}) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Day</TableHead>
          <TableHead>Active</TableHead>
          <TableHead>Start</TableHead>
          <TableHead>End{" "}<InfoHover tooltip="The latest time to begin dialing." /></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((day) => (
          <TableRow key={day}>
            <TableCell>{day}</TableCell>
            <TableCell>
              <Checkbox
                checked={schedule[day.toLowerCase() as DayName]?.active}
                onCheckedChange={(e) => {
                  handleCheckboxChange(day.toLowerCase() as DayName)
                }}
              />
            </TableCell>
            <TableCell>
              <input
                name={`${day.toLowerCase()}-start`}
                id={`${day.toLowerCase()}-start`}
                type="time"
                className="rounded border p-1"
                value={schedule[day.toLowerCase() as DayName]?.intervals?.[0]?.start || ""}
                onChange={(e) => handleTimeChange(day.toLowerCase() as DayName, 'start', e.target.value, 0)}
                disabled={!schedule[day.toLowerCase() as DayName]?.active}
              />
            </TableCell>
            <TableCell>
              <input
                name={`${day.toLowerCase()}-end`}
                id={`${day.toLowerCase()}-end`}
                type="time"
                className="rounded border p-1"
                value={schedule[day.toLowerCase() as DayName]?.intervals?.[0]?.end || ""}
                onChange={(e) => handleTimeChange(day.toLowerCase() as DayName, 'end', e.target.value, 0)}
                disabled={!schedule[day.toLowerCase() as DayName]?.active}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default WeeklyScheduleTable;