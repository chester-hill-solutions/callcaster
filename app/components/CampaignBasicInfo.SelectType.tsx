import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export default function SelectType({handleInputChange, campaignData, flags}){
    const isLiveCallEnabled = flags?.call?.campaign === true;
    const isMessageEnabled = flags?.sms?.campaign === true;
    const isRobocallEnabled = flags?.ivr?.campaign === true;
  
    return (
        <div className="flex flex-grow flex-col gap-1 min-w-48">
        <Label htmlFor="type">Campaign Type</Label>
        <Select
          value={campaignData.type}
          onValueChange={(value) => handleInputChange("type", value)}
        >
          <SelectTrigger id="type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {isMessageEnabled && (
              <SelectItem value="message">Message</SelectItem>
            )}
            {isRobocallEnabled && (
              <SelectItem value="robocall">
                Interactive Voice Recording
              </SelectItem>
            )}
            {isLiveCallEnabled && (
              <SelectItem value="live_call">Live Call</SelectItem>
            )}
          </SelectContent>
        </Select>
        </div>
    )
}