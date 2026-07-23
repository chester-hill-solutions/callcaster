import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { NavLink } from "react-router";
import { Campaign } from "@/lib/types";

type SmsSendContext = {
  messagingServiceReady: boolean;
  defaultMessagingServiceSid: string | null;
  attachedSenderPhoneNumbers: string[];
};

/**
 * Setup extras for message campaigns: outbound send mode only.
 * Script assignment lives under Content; dial/pacing under Launch.
 */
export const CampaignTypeSpecificSettings = ({
  campaignData,
  handleInputChange,
  isBusy,
  smsSendContext,
}: {
  campaignData: NonNullable<Campaign>;
  handleInputChange: (name: string, value: unknown) => void;
  isBusy: boolean;
  smsSendContext?: SmsSendContext;
}) => {
  if (campaignData.type !== "message") {
    return null;
  }

  const smsSendModeForUi = campaignData.sms_send_mode ?? "from_number";

  return (
    <div className="space-y-4">
      <FormField
        label="Send using"
        description={
          smsSendContext && !smsSendContext.messagingServiceReady
            ? "Messaging Service needs a configured SID and at least one sender. Finish onboarding or choose Phone number."
            : smsSendModeForUi === "messaging_service"
              ? "Twilio sends from your Messaging Service pool."
              : "Choose the From number above."
        }
      >
        <Select
          value={smsSendModeForUi}
          onValueChange={(value) => {
            if (value === "messaging_service") {
              handleInputChange(
                "sms_messaging_service_sid",
                smsSendContext?.defaultMessagingServiceSid ?? "",
              );
              handleInputChange("sms_send_mode", "messaging_service");
            } else {
              handleInputChange("sms_send_mode", "from_number");
              handleInputChange("sms_messaging_service_sid", null);
            }
          }}
          disabled={isBusy}
        >
          <SelectTrigger id="sms_send_mode" className="max-w-md">
            <SelectValue placeholder="Delivery mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="messaging_service"
              disabled={!smsSendContext?.messagingServiceReady}
            >
              Messaging Service
            </SelectItem>
            <SelectItem value="from_number">Phone number</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <p className="text-sm text-muted-foreground">
        Message body is edited under Content.{" "}
        <Button variant="link" className="h-auto px-0" asChild>
          <NavLink to="../script/edit">Edit content →</NavLink>
        </Button>
      </p>
    </div>
  );
};
