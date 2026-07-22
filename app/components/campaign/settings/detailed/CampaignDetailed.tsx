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
import SelectScript from "./CampaignDetailed.SelectScript";
import {
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Script,
} from "@/lib/types";

type CampaignDetails = LiveCampaign | MessageCampaign | IVRCampaign;

type SmsSendContext = {
  messagingServiceReady: boolean;
  defaultMessagingServiceSid: string | null;
  attachedSenderPhoneNumbers: string[];
};

/**
 * Thin Setup extras: outbound send mode (SMS) and content assignment.
 * Dial options, pacing, and split prompts live under Launch.
 */
export const CampaignTypeSpecificSettings = ({
  campaignData,
  handleInputChange,
  scripts,
  details,
  isBusy,
  smsSendContext,
}: {
  campaignData: NonNullable<Campaign>;
  handleInputChange: (name: string, value: unknown) => void;
  scripts: Script[];
  details: CampaignDetails;
  isBusy: boolean;
  smsSendContext?: SmsSendContext;
}) => {
  const isScriptMissing = "script_id" in details && !details.script_id;
  const smsSendModeForUi = campaignData.sms_send_mode ?? "from_number";
  const selectedScriptId =
    "script_id" in details ? details.script_id ?? null : null;
  const selectedScript = scripts.find(
    (script) => String(script.id) === String(selectedScriptId),
  );

  if (campaignData.type === "message") {
    return (
      <div id="campaign-setup-content" className="space-y-4">
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
  }

  return (
    <div id="campaign-setup-content" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <SelectScript
          handleInputChange={handleInputChange}
          selectedScript={selectedScriptId}
          scripts={scripts}
          invalid={isScriptMissing}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {selectedScript
          ? `Using “${selectedScript.name}”. `
          : "Pick a script, then edit it under Content. "}
        <Button variant="link" className="h-auto px-0" asChild>
          <NavLink to="../script/edit">Edit content →</NavLink>
        </Button>
      </p>
    </div>
  );
};
