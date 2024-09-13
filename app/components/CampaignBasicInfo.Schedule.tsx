import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "./ui/table";
import { Checkbox } from "./ui/checkbox";
import { days } from "~/lib/utils";

const WeeklyScheduleTable = ({ schedule, handleCheckboxChange, handleTimeChange }) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Day</TableHead>
          <TableHead>Active</TableHead>
          <TableHead>Start</TableHead>
          <TableHead>End</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((day) => (
          <TableRow key={day}>
            <TableCell>{day}</TableCell>
            <TableCell>
              <Checkbox 
                checked={schedule[day.toLowerCase()].active}
                onCheckedChange={() => handleCheckboxChange(day)}
              />
            </TableCell>
            <TableCell>
              <input
                name={`${day.toLowerCase()}-start`}
                id={`${day.toLowerCase()}-start`}
                type="time"
                className="rounded border p-1"
                value={schedule[day.toLowerCase()].intervals[0]?.start || ""}
                onChange={(e) => handleTimeChange(day, 'start', e.target.value)}
                disabled={!schedule[day.toLowerCase()].active}
              />
            </TableCell>
            <TableCell>
              <input
                name={`${day.toLowerCase()}-end`}
                id={`${day.toLowerCase()}-end`}
                type="time"
                className="rounded border p-1"
                value={schedule[day.toLowerCase()].intervals[0]?.end || ""}
                onChange={(e) => handleTimeChange(day, 'end', e.target.value)}
                disabled={!schedule[day.toLowerCase()].active}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default WeeklyScheduleTable;