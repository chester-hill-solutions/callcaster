import { Form } from "react-router";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TWILIO_MESSAGE_INTENT_VALUES,
  TWILIO_MULTI_TENANCY_MODE_VALUES,
  TWILIO_SMS_SENDER_CLASS_VALUES,
  TWILIO_THROUGHPUT_PRODUCT_VALUES,
  TWILIO_TRAFFIC_CLASS_VALUES,
  type WorkspaceTwilioOpsConfig,
} from "@/lib/types";

import type { TwilioPageData } from "../loadTwilioData.server";

import { formatLabel } from "./AdminTwilioPortal.utils";

export function PortalForm({
  config,
  effectiveConfig,
  detectedTrafficClass,
  metrics,
}: {
  config: WorkspaceTwilioOpsConfig;
  effectiveConfig: WorkspaceTwilioOpsConfig;
  detectedTrafficClass: TwilioPageData["portalSnapshot"]["detectedTrafficClass"];
  metrics: TwilioPageData["portalSnapshot"]["metrics"];
}) {
  const suggestedTrafficClass =
    config.trafficClass !== "unknown" ? config.trafficClass : detectedTrafficClass;

  return (
    <Form method="post" className="space-y-6">
      <input type="hidden" name="_action" value="update_twilio_portal" />

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Provisioning (read-only)</h3>
          <p className="text-sm text-muted-foreground">
            Send mode, Messaging Service SID, and onboarding status come from workspace onboarding.
            Use onboarding actions to change provisioning; values below show effective runtime settings.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            htmlFor="effectiveSendMode"
            label="How messages are sent (effective)"
            description={
              metrics.messagingServiceCount > 0
                ? `Observed ${metrics.messagingServiceCount} recent sends via Messaging Service.`
                : "No recent Messaging Service sends detected in local history."
            }
          >
            <Input
              id="effectiveSendMode"
              readOnly
              value={formatLabel(effectiveConfig.sendMode)}
              className="bg-muted"
            />
          </FormField>

          <FormField
            htmlFor="effectiveMessagingServiceSid"
            label="Messaging Service SID (effective)"
            description="Configured by workspace messaging onboarding."
          >
            <Input
              id="effectiveMessagingServiceSid"
              readOnly
              value={effectiveConfig.messagingServiceSid ?? "Not configured"}
              className="bg-muted"
            />
          </FormField>

          <FormField
            htmlFor="effectiveOnboardingStatus"
            label="Twilio onboarding status (effective)"
            description="Derived from messaging onboarding progress."
          >
            <Input
              id="effectiveOnboardingStatus"
              readOnly
              value={formatLabel(effectiveConfig.onboardingStatus)}
              className="bg-muted"
            />
          </FormField>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Sending defaults</h3>
          <p className="text-sm text-muted-foreground">
            Workspace-level ops settings for delivery prioritization and throughput tuning.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            htmlFor="defaultMessageIntent"
            label="Default MessageIntent"
            description="Use this when important traffic should be tagged automatically unless callers provide an override."
          >
            <select
              id="defaultMessageIntent"
              name="defaultMessageIntent"
              defaultValue={config.defaultMessageIntent ?? ""}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {TWILIO_MESSAGE_INTENT_VALUES.map((value) => (
                <option key={value} value={value}>
                  {formatLabel(value)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            htmlFor="trafficShapingEnabled"
            label="Priority routing"
            description="Recommended when urgent notifications should not sit behind bulk campaign traffic."
          >
            <div className="flex min-h-10 items-center gap-2 rounded-md border border-input px-3">
              <input
                id="trafficShapingEnabled"
                name="trafficShapingEnabled"
                type="checkbox"
                defaultChecked={config.trafficShapingEnabled}
                className="h-4 w-4 rounded border border-input"
              />
              <Label htmlFor="trafficShapingEnabled" className="cursor-pointer">
                Enable Traffic Shaping
              </Label>
            </div>
          </FormField>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Detected traffic and Twilio throughput</h3>
          <p className="text-sm text-muted-foreground">
            These fields shape throughput recommendations. They start from observed data when the saved config is still unset.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            htmlFor="trafficClass"
            label="What kind of traffic is this?"
            description={
              detectedTrafficClass !== "unknown"
                ? `Detected from current numbers: ${formatLabel(detectedTrafficClass)}.`
                : "No clear sender type detected from current numbers yet."
            }
          >
            <select
              id="trafficClass"
              name="trafficClass"
              defaultValue={suggestedTrafficClass}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {TWILIO_TRAFFIC_CLASS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {formatLabel(value)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            htmlFor="throughputProduct"
            label="Throughput product"
            description="Advanced setting. Only applies once Twilio has enabled the parent-account throughput product."
          >
            <select
              id="throughputProduct"
              name="throughputProduct"
              defaultValue={config.throughputProduct}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {TWILIO_THROUGHPUT_PRODUCT_VALUES.map((value) => (
                <option key={value} value={value}>
                  {formatLabel(value)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            htmlFor="multiTenancyMode"
            label="Multi-Tenancy Mode"
            description="Advanced setting for how shared parent-account throughput should be distributed across subaccounts."
          >
            <select
              id="multiTenancyMode"
              name="multiTenancyMode"
              defaultValue={config.multiTenancyMode}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {TWILIO_MULTI_TENANCY_MODE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {formatLabel(value)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Campaign throughput</h3>
          <p className="text-sm text-muted-foreground">
            Controls parallel campaign dispatch pacing. Keep legacy mode until Twilio sender and voice limits are confirmed.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            htmlFor="smsSenderClass"
            label="SMS sender class"
            description="Used for throughput estimates and bulk SMS deliverability warnings."
          >
            <select
              id="smsSenderClass"
              name="smsSenderClass"
              defaultValue={config.smsSenderClass}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {TWILIO_SMS_SENDER_CLASS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {formatLabel(value)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            htmlFor="smsTargetMps"
            label="SMS target MPS"
            description="Segments per second for parallel SMS dispatch."
          >
            <Input
              id="smsTargetMps"
              name="smsTargetMps"
              type="number"
              min={0.1}
              step={0.1}
              defaultValue={config.smsTargetMps}
            />
          </FormField>

          <FormField
            htmlFor="voiceTargetCps"
            label="Voice target CPS"
            description="Outbound IVR dial starts per second."
          >
            <Input
              id="voiceTargetCps"
              name="voiceTargetCps"
              type="number"
              min={0.1}
              step={0.1}
              defaultValue={config.voiceTargetCps}
            />
          </FormField>

          <FormField
            htmlFor="voiceConcurrentCallLimit"
            label="IVR concurrent call limit"
            description="Dispatcher guardrail for active/ringing campaign calls."
          >
            <Input
              id="voiceConcurrentCallLimit"
              name="voiceConcurrentCallLimit"
              type="number"
              min={1}
              step={1}
              defaultValue={config.voiceConcurrentCallLimit}
            />
          </FormField>

          <FormField
            htmlFor="parallelDispatchEnabled"
            label="Parallel dispatch"
            description="When enabled, queue-next batches work instead of the legacy one-at-a-time chain."
          >
            <div className="flex min-h-10 items-center gap-2 rounded-md border border-input px-3">
              <input
                id="parallelDispatchEnabled"
                name="parallelDispatchEnabled"
                type="checkbox"
                defaultChecked={config.parallelDispatchEnabled}
                className="h-4 w-4 rounded border border-input"
              />
              <Label htmlFor="parallelDispatchEnabled" className="cursor-pointer">
                Enable parallel campaign dispatch
              </Label>
            </div>
          </FormField>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Operator context</h3>
          <p className="text-sm text-muted-foreground">
            Keep ticket notes and escalation details here so operators understand the current rollout state.
          </p>
        </div>

        <FormField
          htmlFor="supportNotes"
          label="Operator Notes"
          description="Document carrier constraints, Twilio ticket context, or rollout notes."
        >
          <Textarea
            id="supportNotes"
            name="supportNotes"
            defaultValue={config.supportNotes}
            placeholder="Document carrier constraints, Twilio ticket context, or rollout notes."
          />
        </FormField>
      </div>

      <div className="flex justify-end">
        <Button type="submit">Save Workspace Twilio Setup</Button>
      </div>
    </Form>
  );
}
