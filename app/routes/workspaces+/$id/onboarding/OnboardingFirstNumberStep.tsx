import { Link, useFetcher, useRevalidator } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { NumberPurchase } from "@/components/phone-numbers/NumberPurchase";
import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";
import {
  NumberSummaryList,
  type RoutingPresetSubmission,
} from "@/components/phone-numbers/NumberSummaryList";
import {
  CallerIdVerificationDialog,
  type CallerIdValidationRequest,
} from "@/components/phone-numbers/CallerIdVerificationDialog";
import { CallerIdVerificationForm } from "@/components/phone-numbers/CallerIdVerificationForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Section, SectionHeader } from "@/components/shared/Section";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { goalNeedsSmsCompliance } from "@/lib/messaging-onboarding/goals";
import {
  countRentedWorkspaceNumbers,
  countVerifiedCallerIdNumbers,
  isVerifiedCallerIdNumber,
  workspaceHasFirstNumber,
} from "@/lib/messaging-onboarding/predicates";
import type { OnboardingStepProps } from "./types";
import type { InboundRoutingPresetId } from "../../../../../shared/inbound-routing-presets";
import type { WorkspaceOnboardingGoal } from "@/lib/types";

type OnboardingFirstNumberStepProps = Pick<
  OnboardingStepProps,
  | "onboarding"
  | "workspaceId"
  | "phoneNumbers"
  | "isReadOnly"
  | "workspaceUsers"
  | "mediaNames"
  | "inboundQueues"
  | "scripts"
  | "pending"
> & {
  creditsBalance: number;
  validationRequest?: CallerIdValidationRequest | null;
};

// Reuse the same patch-number action handlers the numbers settings page uses
// (app/routes/workspaces+/$id/settings/numbers.action.server.ts) instead of
// building a second inbound-routing/handset write path (Phase G, Q44-46/59).
function numbersSettingsActionPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/settings/numbers`;
}

function presetOrderForGoal(
  goal: WorkspaceOnboardingGoal | null,
): readonly InboundRoutingPresetId[] {
  switch (goal) {
    case "live_call":
      return ["agent", "queue", "voicemail", "automated_menu", "forward", "webhook_only"];
    case "ivr":
      return ["automated_menu", "voicemail", "queue", "agent", "forward", "webhook_only"];
    case "sms_blast":
      return ["voicemail", "agent", "queue", "automated_menu", "forward", "webhook_only"];
    case null:
      return ["agent", "queue", "automated_menu", "voicemail", "forward", "webhook_only"];
    default: {
      const exhaustiveGoal: never = goal;
      return exhaustiveGoal;
    }
  }
}

export function OnboardingFirstNumberStep({
  onboarding,
  workspaceId,
  phoneNumbers,
  creditsBalance,
  isReadOnly,
  workspaceUsers,
  mediaNames,
  inboundQueues,
  scripts,
  pending,
  validationRequest,
}: OnboardingFirstNumberStepProps) {
  const purchaseFetcher = useFetcher<NumbersSearchFetcherData>();
  const routingFetcher = useFetcher();
  const revalidator = useRevalidator();
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(
    () => Boolean(validationRequest),
  );
  const [activeValidationRequest, setActiveValidationRequest] =
    useState<CallerIdValidationRequest | null>(validationRequest ?? null);

  /**
   * @effect Open the verification-code dialog when the route action returns a validationRequest
   *   (document form submit, same pattern as Settings → Numbers).
   * @effect-deps validationRequest from useActionData via the parent route
   * @effect-side-effects setState for dialog open + retained request payload
   * @effect-why-not-loader Action data arrives after the mutation; opening a modal is client-only.
   */
  useEffect(() => {
    if (!validationRequest) return;
    setActiveValidationRequest(validationRequest);
    setVerificationDialogOpen(true);
  }, [validationRequest]);

  const numbers = phoneNumbers ?? [];
  const rentedCount = countRentedWorkspaceNumbers(numbers);
  const rentedNumbers = numbers.filter((number) => number?.type === "rented");
  const verifiedCallerIdCount = countVerifiedCallerIdNumbers(numbers);
  const hasFirstNumber = workspaceHasFirstNumber(numbers);
  const messagingReady = Boolean(onboarding.messagingService.serviceSid);
  const isRoutingBusy = routingFetcher.state !== "idle";
  const actionPath = numbersSettingsActionPath(workspaceId);
  const isVerifying = pending.isVerifyingCallerId;

  const handlePurchaseComplete = useCallback(() => {
    revalidator.revalidate();
  }, [revalidator]);

  const handleIncomingActivityChange = useCallback(
    (numberId: number, value: string) => {
      routingFetcher.submit(
        { formName: "update-incoming-activity", numberId: String(numberId), incomingActivity: value },
        { method: "POST", action: actionPath },
      );
    },
    [routingFetcher, actionPath],
  );

  const handleIncomingVoiceMessageChange = useCallback(
    (numberId: number, value: string) => {
      routingFetcher.submit(
        { formName: "update-incoming-voice-message", numberId: String(numberId), incomingVoiceMessage: value },
        { method: "POST", action: actionPath },
      );
    },
    [routingFetcher, actionPath],
  );

  const handleHandsetChange = useCallback(
    (numberId: number, enabled: boolean) => {
      routingFetcher.submit(
        { formName: "update-handset", numberId: String(numberId), handsetEnabled: String(enabled) },
        { method: "POST", action: actionPath },
      );
    },
    [routingFetcher, actionPath],
  );

  const handleInboundRingCountChange = useCallback(
    (numberId: number, value: string) => {
      routingFetcher.submit(
        { formName: "update-inbound-ring-count", numberId: String(numberId), inboundRingCount: value },
        { method: "POST", action: actionPath },
      );
    },
    [routingFetcher, actionPath],
  );

  const handleInboundQueueChange = useCallback(
    (numberId: number, queueId: string) => {
      routingFetcher.submit(
        { formName: "update-inbound-queue", numberId: String(numberId), inboundQueueId: queueId },
        { method: "POST", action: actionPath },
      );
    },
    [routingFetcher, actionPath],
  );

  const handleInboundScriptChange = useCallback(
    (numberId: number, scriptId: string) => {
      routingFetcher.submit(
        { formName: "update-inbound-script", numberId: String(numberId), inboundScriptId: scriptId },
        { method: "POST", action: actionPath },
      );
    },
    [routingFetcher, actionPath],
  );

  const handleCallerIdChange = useCallback(
    (numberId: number, value: string) => {
      routingFetcher.submit(
        { formName: "update-caller-id", numberId: String(numberId), friendly_name: value },
        { method: "POST", action: actionPath },
      );
    },
    [routingFetcher, actionPath],
  );

  const handleNumberRemoval = useCallback(
    (numberId: number) => {
      routingFetcher.submit(
        { formName: "remove-number", numberId: String(numberId) },
        { method: "POST", action: actionPath },
      );
    },
    [routingFetcher, actionPath],
  );

  const handleApplyPreset = useCallback(
    (submission: RoutingPresetSubmission) => {
      routingFetcher.submit(submission, { method: "POST", action: actionPath });
    },
    [routingFetcher, actionPath],
  );

  const smsGoal = goalNeedsSmsCompliance(onboarding.selectedGoal);
  const callerIdNumbers = numbers.filter((number) => number?.type === "caller_id");

  if (!messagingReady) {
    return (
      <Section variant="flat">
        <SectionHeader
          compact
          title="Phone number"
          description="Messaging setup is still finishing. Refresh in a moment, then add a phone number."
        />
        <Alert>
          <AlertDescription>
            Workspace messaging is preparing. Once it is ready you can search for numbers here.
          </AlertDescription>
        </Alert>
      </Section>
    );
  }

  return (
    <>
      <CallerIdVerificationDialog
        isOpen={verificationDialogOpen}
        onOpenChange={(open) => {
          setVerificationDialogOpen(open);
          if (!open) setActiveValidationRequest(null);
        }}
        validationRequest={activeValidationRequest}
      />
      <Section variant="flat">
        <SectionHeader
          compact
          title="Phone number"
          description="Rent a number for inbound and outbound traffic, or verify a number you already own for outbound calling and texting."
        />
        <div className="space-y-6">
          {smsGoal ? (
            <TooltipProvider>
              <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                <p>
                  For SMS blasts, a toll-free number supports higher sending volume after
                  verification. A local number works for lighter texting at a lower rate.
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="mt-2 text-xs font-medium underline">
                      Number choice tip
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Pick toll-free when you expect higher daily volume. Pick local when you mainly
                    need a regional presence and lighter sending.
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ) : null}
          {hasFirstNumber ? (
            <Alert>
              <AlertDescription>
                {rentedCount > 0
                  ? `You have ${rentedCount} rented number${rentedCount === 1 ? "" : "s"} on this workspace.`
                  : null}
                {rentedCount > 0 && verifiedCallerIdCount > 0 ? " " : null}
                {verifiedCallerIdCount > 0
                  ? `${verifiedCallerIdCount} verified caller ID${verifiedCallerIdCount === 1 ? "" : "s"} ready for outbound.`
                  : null}{" "}
                Continue when you are ready, or add another number below.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <fieldset className="space-y-4 rounded-md bg-muted/40 p-3">
              <legend className="text-sm font-medium">Rent a Canadian number</legend>
              <p className="text-sm text-muted-foreground">
                Best for inbound SMS, inbound calls, and full two-way messaging.
              </p>
              {isReadOnly ? (
                <p className="text-sm text-muted-foreground">
                  Only workspace owners and admins can rent numbers. Ask an admin to complete this
                  step.
                </p>
              ) : (
                <NumberPurchase
                  fetcher={purchaseFetcher}
                  workspaceId={workspaceId}
                  creditsBalance={creditsBalance}
                  billingLink={`/workspaces/${workspaceId}/billing`}
                  onPurchaseComplete={handlePurchaseComplete}
                />
              )}
            </fieldset>

            <fieldset className="space-y-4 rounded-md bg-muted/40 p-3">
              <legend className="text-sm font-medium">Verify your own number</legend>
              <p className="text-sm text-muted-foreground">
                Outbound SMS and calls only. Rent a number for inbound traffic.
              </p>
              {callerIdNumbers.length > 0 ? (
                <ul className="space-y-2" data-testid="onboarding-caller-id-list">
                  {callerIdNumbers.map((number) => {
                    const pendingStatus =
                      !isVerifiedCallerIdNumber(number) &&
                      number.capabilities &&
                      typeof number.capabilities === "object" &&
                      !Array.isArray(number.capabilities) &&
                      (number.capabilities as Record<string, unknown>)
                        .verification_status === "pending";
                    return (
                      <li
                        key={number.id ?? number.phone_number}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
                      >
                        <span className="font-mono">
                          {number.phone_number ?? "Unknown number"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {isVerifiedCallerIdNumber(number)
                            ? "Verified"
                            : pendingStatus
                              ? "Awaiting verification"
                              : "Caller ID"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {isReadOnly ? (
                <p className="text-sm text-muted-foreground">
                  Only workspace owners and admins can verify numbers. Ask an admin to complete this
                  step.
                </p>
              ) : (
                <CallerIdVerificationForm
                  formId="onboarding-caller-id-form"
                  actionName="verify_caller_id"
                  disabled={isVerifying}
                  isPending={isVerifying}
                />
              )}
            </fieldset>
          </div>

          {rentedNumbers.length > 0 && !isReadOnly ? (
            <div className="space-y-2 border-t border-border/60 pt-6">
              <div>
                <h3 className="font-medium">Inbound routing</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a routing preset for each rented number. Advanced settings include
                  handset behavior, ring count, voicemail greetings, and individual routing fields.
                </p>
              </div>
              <NumberSummaryList
                phoneNumbers={rentedNumbers}
                users={workspaceUsers}
                mediaNames={mediaNames}
                queues={inboundQueues}
                scripts={scripts}
                verifiedCallerIds={numbers}
                onIncomingActivityChange={handleIncomingActivityChange}
                onIncomingVoiceMessageChange={handleIncomingVoiceMessageChange}
                onCallerIdChange={handleCallerIdChange}
                onHandsetChange={handleHandsetChange}
                onInboundRingCountChange={handleInboundRingCountChange}
                onInboundQueueChange={handleInboundQueueChange}
                onInboundScriptChange={handleInboundScriptChange}
                onNumberRemoval={handleNumberRemoval}
                onApplyPreset={handleApplyPreset}
                presetOrder={presetOrderForGoal(onboarding.selectedGoal)}
                isBusy={isRoutingBusy}
              />
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">
            Manage numbers later in{" "}
            <Link className="underline" to={`/workspaces/${workspaceId}/settings/numbers`}>
              Settings
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
