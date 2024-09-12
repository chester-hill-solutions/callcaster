import { DateTimePicker } from "./ui/datetime";
import { Label } from "./ui/label";

export default function SelectDates({ campaignData, handleInputChange }) {
  return (
    <>
      <div className="flex flex-grow flex-col gap-1 min-w-48">
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
      <div className="flex flex-grow flex-col gap-1 min-w-48">
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
    </>
  );
}
