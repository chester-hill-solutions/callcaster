import { Link, useFetcher, useRevalidator } from "react-router";
import { useEffect, useState } from "react";
import { NumberPurchase } from "@/components/phone-numbers/NumberPurchase";
import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";
import { NumberSummaryList } from "@/components/phone-numbers/NumberSummaryList";
import { useWorkspaceNumberSettingsMutations } from "@/hooks/phone";
import {
  CallerIdVerificationDialog,
  type CallerIdValidationRequest,
} from "@/components/phone-numbers/CallerIdVerificationDialog";
import { CallerIdVerificationForm } from "@/components/phone-numbers/CallerIdVerificationForm";
import {
  isServiceAddressComplete,
  ServiceAddressGate,
} from "@/components/phone-numbers/ServiceAddressGate";
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

function presetOrderForGoal(
  goal: WorkspaceOnboardingGoal | null,
): readonly InboundRoutingPresetId[] {
  switch (goal) {
    case "live_call":
    case "rent_number":
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
  const revalidator = useRevalidator();
  const {
    isBusy: isRoutingBusy,
    onIncomingActivityChange,
    onIncomingVoiceMessageChange,
    onHandsetChange,
    onInboundRingCountChange,
    onInboundQueueChange,
    onInboundScriptChange,
    onCallerIdChange,
    onNumberRemoval,
    onApplyPreset,
  } = useWorkspaceNumberSettingsMutations(workspaceId);
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
  const isVerifying = pending.isVerifyingCallerId;

  const handlePurchaseComplete = () => {
    revalidator.revalidate();
  };

  const smsGoal = goalNeedsSmsCompliance(onboarding.selectedGoal);
  const callerIdNumbers = numbers.filter((number) => number?.type === "caller_id");
  const hasServiceAddress = isServiceAddressComplete(
    onboarding.emergencyVoice.address,
  );
  const firstNumberReturnTo = `/workspaces/${workspaceId}/onboarding?step=first_number`;

  if (!messagingReady) {
    // Distinguish "still working on it" from "we gave up". The compliance job
    // marks the workspace rejected and records why; showing the optimistic
    // "preparing" copy in that case left customers refreshing forever.
    const bootstrapFailed =
      onboarding.subaccountBootstrap.status === "rejected" ||
      Boolean(onboarding.reviewState.lastError);
    const reasons = onboarding.reviewState.blockingIssues;

    return (
      <Section variant="flat">
        <SectionHeader
          compact
          title="Phone number"
          description={
            bootstrapFailed
              ? "We could not finish setting up messaging for this workspace."
              : "Messaging setup is still finishing. Refresh in a moment, then add a phone number."
          }
        />
        <Alert variant={bootstrapFailed ? "destructive" : undefined}>
          <AlertDescription>
            {bootstrapFailed ? (
              <>
                <p>
                  Setup did not complete, so numbers cannot be added yet. Our team has
                  been notified.
                </p>
                {reasons.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              "Workspace messaging is preparing. Once it is ready you can search for numbers here."
            )}
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
          description="Set a service address, then rent a number or verify one you already own. Configure inbound routing after a number is on the workspace."
        />
        <div className="space-y-8">
          <ServiceAddressGate
            workspaceId={workspaceId}
            onboarding={onboarding}
            isReadOnly={isReadOnly}
            returnTo={firstNumberReturnTo}
          />
          {smsGoal ? (
            <TooltipProvider>
              <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                <p>
                  Toll-free numbers support higher SMS volume after verification, and that
                  path requires a Canadian business number (BN). A local number works for
                  lighter texting without BN verification.
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="mt-2 text-xs font-medium underline">
                      Number choice tip
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Choose toll-free when you have a BN ready for carrier verification and
                    expect higher daily volume. Choose local for regional presence and lighter
                    sending.
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

          {/* Address first → then choose rent vs verify (#1114). */}
          {hasServiceAddress ? (
            <div className="grid min-w-0 grid-cols-1 gap-8">
              <fieldset className="min-w-0 space-y-4 overflow-hidden rounded-md bg-muted/40 p-4">
                <legend className="px-1 text-sm font-medium">Rent a Canadian number</legend>
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

              <fieldset className="min-w-0 space-y-4 overflow-hidden rounded-md bg-muted/40 p-4">
                <legend className="px-1 text-sm font-medium">Verify your own number</legend>
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
                          className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
                        >
                          <span className="truncate font-mono">
                            {number.phone_number ?? "Unknown number"}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
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
          ) : (
            <Alert>
              <AlertDescription>
                Save a service address above before searching for numbers to rent or verifying a
                caller ID.
              </AlertDescription>
            </Alert>
          )}

          {/* Routing only after a rented number exists (#1114). */}
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
                onIncomingActivityChange={onIncomingActivityChange}
                onIncomingVoiceMessageChange={onIncomingVoiceMessageChange}
                onCallerIdChange={onCallerIdChange}
                onHandsetChange={onHandsetChange}
                onInboundRingCountChange={onInboundRingCountChange}
                onInboundQueueChange={onInboundQueueChange}
                onInboundScriptChange={onInboundScriptChange}
                onNumberRemoval={onNumberRemoval}
                onApplyPreset={onApplyPreset}
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
