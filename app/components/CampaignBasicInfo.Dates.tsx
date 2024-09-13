import { useState } from "react";
import WeeklyScheduleTable from "./CampaignBasicInfo.Schedule";
import { Button } from "./ui/button";
import { DateTimePicker } from "./ui/datetime";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { days } from "~/lib/utils";

export default function SelectDates({ campaignData, handleInputChange }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState(
    campaignData.schedule ||
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
        active: !prev[day.toLowerCase()].active,
        intervals: prev[day.toLowerCase()].active
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
    setDialogOpen(false);
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

  return (
    <>
      <div className="flex min-w-48 flex-grow flex-col gap-1">
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
      <div className="flex min-w-48 flex-grow flex-col gap-1">
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
      <div className="flex flex-grow flex-col justify-end gap-1">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button
            variant={"outline"}
            onClick={() => setDialogOpen(true)}
          >
            <p>Set Calling Hours</p>
          </Button>
          <DialogContent className="flex flex-col items-center bg-card">
            <DialogHeader>
              <DialogTitle className="text-center font-Zilla-Slab text-2xl">
                Set Calling Hours
              </DialogTitle>
            </DialogHeader>
            <div>
              <WeeklyScheduleTable
                schedule={scheduleForDisplay}
                handleCheckboxChange={handleCheckboxChange}
                handleTimeChange={handleTimeChange}
              />
            </div>
            <DialogFooter className="flex w-full justify-end gap-4 px-4">
              <Button variant={"outline"} className="border-[#333]" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}