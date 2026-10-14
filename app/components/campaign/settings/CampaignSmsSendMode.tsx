import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SmsSendContext = {
  messagingServiceReady: boolean;
  defaultMessagingServiceSid: string | null;
  attachedSenderPhoneNumbers?: string[];
};

export function CampaignSmsSendMode({
  value,
  onChange,
  isBusy,
  smsSendContext,
}: {
  value: string | null | undefined;
  onChange: (name: string, value: unknown) => void;
  isBusy: boolean;
  smsSendContext?: SmsSendContext;
}) {
  const sendMode = value ?? "from_number";

  return (
    <FormField
      label="Send using"
      description={
        smsSendContext && !smsSendContext.messagingServiceReady
          ? "Messaging Service needs a configured SID and at least one sender. Finish onboarding or choose Phone number."
          : sendMode === "messaging_service"
            ? "Twilio sends from your Messaging Service pool."
            : "Choose the From number above."
      }
    >
      <Select
        value={sendMode}
        onValueChange={(nextValue) => {
          if (nextValue === "messaging_service") {
            onChange(
              "sms_messaging_service_sid",
              smsSendContext?.defaultMessagingServiceSid ?? "",
            );
            onChange("sms_send_mode", "messaging_service");
          } else {
            onChange("sms_send_mode", "from_number");
            onChange("sms_messaging_service_sid", null);
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
  );
}
