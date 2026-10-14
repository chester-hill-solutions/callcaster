import SelectType from "./CampaignBasicInfo.SelectType";
import SelectNumber from "./CampaignBasicInfo.SelectNumber";
import SelectDates from "./CampaignBasicInfo.Dates";
import { FormField } from "@/components/ui/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Campaign, Flags, WorkspaceNumbers } from "@/lib/types";

interface CampaignBasicInfoProps {
  campaignData: Campaign;
  handleInputChange: (name: string, value: string | number | null) => void;
  phoneNumbers: WorkspaceNumbers[];
  flags: Flags;
  callerIdOptional?: boolean;
  isBusy?: boolean;
  smsSendContext?: {
    messagingServiceReady: boolean;
    defaultMessagingServiceSid: string | null;
  };
}

/** Setup fields only: type, number, schedule. Launch controls live on /launch. */
export const CampaignBasicInfo = ({
  campaignData,
  handleInputChange,
  phoneNumbers,
  flags: _flags,
  callerIdOptional = false,
  isBusy = false,
  smsSendContext,
}: CampaignBasicInfoProps) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="min-w-[250px] flex-1">
          <SelectType
            campaignData={campaignData}
            handleInputChange={(name, value) =>
              handleInputChange(
                name,
                typeof value === "boolean"
                  ? value
                    ? 1
                    : 0
                  : (value as string | number | null),
              )
            }
          />
        </div>
        <div id="campaign-setup-number" className="min-w-[250px] flex-1 space-y-1">
          <SelectNumber
            campaignData={{ caller_id: campaignData.caller_id ?? undefined }}
            handleInputChange={(name, value) => handleInputChange(name, value)}
            phoneNumbers={phoneNumbers}
            callerIdOptional={callerIdOptional}
          />
          {campaignData.type === "message" && callerIdOptional ? (
            <p className="text-xs text-muted-foreground">
              Outbound number is optional when sending via Messaging Service
              (Twilio uses the service&apos;s sender pool).
            </p>
          ) : null}
          {campaignData.type === "message" ? (
            <FormField
              label="Send using"
              description={
                smsSendContext && !smsSendContext.messagingServiceReady
                  ? "Messaging Service needs a configured SID and at least one sender. Finish onboarding or choose Phone number."
                  : campaignData.sms_send_mode === "messaging_service"
                    ? "Twilio sends from your Messaging Service pool."
                    : "Choose the From number above."
              }
            >
              <Select
                value={campaignData.sms_send_mode ?? "from_number"}
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
          ) : null}
        </div>
      </div>

      <div id="campaign-setup-schedule">
        <SelectDates campaignData={campaignData} handleInputChange={handleInputChange} />
      </div>
    </div>
  );
};
