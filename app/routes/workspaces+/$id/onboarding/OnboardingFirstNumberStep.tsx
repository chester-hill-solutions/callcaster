import { Link, useFetcher, useRevalidator, useSearchParams } from "react-router";
import { useEffect, useId, useState, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
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

/**
 * One of the two actions on the first-number step. A `fieldset`/`legend`
 * pair drew the legend across the box's top edge, and `overflow-hidden`
 * clipped it, so the title looked struck through (#1113). A labelled group
 * keeps the accessible grouping with an ordinary in-flow heading.
 */
export function FirstNumberActionGroup({
  title,
  children,
  flat = false,
}: {
  title: string;
  children: ReactNode;
  flat?: boolean;
}) {
  const headingId = useId();
  return (
    <section
      role="group"
      aria-labelledby={headingId}
      className={`min-w-0 space-y-4 ${flat ? "" : "rounded-md bg-muted/40 p-4"}`}
    >
      <h3 id={headingId} className="text-sm font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

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
  const [searchParams] = useSearchParams();
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

  const callerIdNumbers = numbers.filter((number) => number?.type === "caller_id");
  const hasServiceAddress = isServiceAddressComplete(
    onboarding.emergencyVoice.address,
  );
  const firstNumberReturnTo = `/workspaces/${workspaceId}/onboarding?step=first_number`;

  const requestedStep = searchParams.get("numberStep");
  // Saved resources take precedence over an old URL after purchase or verification.
  const numberStep = hasFirstNumber
    ? "complete"
    : requestedStep === "verify" || (!requestedStep && callerIdNumbers.length > 0)
      ? "verify"
      : requestedStep === "rent"
        ? hasServiceAddress ? "rent" : "address"
        : requestedStep === "address" ? "address" : "choose";
  const rentReturnTo = `${firstNumberReturnTo}&numberStep=rent`;

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
          description={hasFirstNumber
            ? rentedCount > 0
              ? "Your number is added. Review how incoming calls are handled, then continue setup."
              : "Your caller ID is verified. Incoming calls stay with your current provider. Continue setup when you are ready."
            : "Get a new number, or verify a number your organization already owns."}
        />
        <div className="space-y-6">
          <nav aria-label="Phone number setup" className="flex flex-wrap items-center gap-2 text-sm">
            {hasFirstNumber ? <span>1. Choose a method</span> : <Link
              className="underline underline-offset-4"
              to={`${firstNumberReturnTo}&numberStep=choose`}
              aria-current={numberStep === "choose" ? "step" : undefined}
            >
              1. Choose a method
            </Link>}
            <span aria-hidden="true">/</span>
            <span aria-current={numberStep === "address" || numberStep === "rent" || numberStep === "verify" ? "step" : undefined}>
              2. {numberStep === "verify" ? "Verify your number" : "Add your number"}
            </span>
            <span aria-hidden="true">/</span>
            <span aria-current={numberStep === "complete" ? "step" : undefined}>3. Review your number</span>
          </nav>
          {numberStep === "choose" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <FirstNumberActionGroup title="Get a new number">
                <p className="text-sm text-muted-foreground">
                  Rent a Canadian number for calls and text messages. You will need a service address and credits.
                </p>
                <Button asChild>
                  <Link to={`${firstNumberReturnTo}&numberStep=address`}>Get a new number</Link>
                </Button>
              </FirstNumberActionGroup>
              <FirstNumberActionGroup title="Use an existing number">
                <p className="text-sm text-muted-foreground">
                  Verify a number you own to use as caller ID. Incoming calls stay with your current provider.
                </p>
                <Button variant="outline" asChild>
                  <Link to={`${firstNumberReturnTo}&numberStep=verify`}>Use an existing number</Link>
                </Button>
              </FirstNumberActionGroup>
            </div>
          ) : null}
          {numberStep === "address" ? (
            <div className="space-y-4">
              <ServiceAddressGate
                workspaceId={workspaceId}
                onboarding={onboarding}
                isReadOnly={isReadOnly}
                returnTo={rentReturnTo}
              />
              {hasServiceAddress ? (
                <Button asChild>
                  <Link to={rentReturnTo}>Continue to number search</Link>
                </Button>
              ) : null}
            </div>
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
                Continue when you are ready. You can add more numbers in Settings.
              </AlertDescription>
            </Alert>
          ) : null}

          {numberStep === "rent" ? (
              <FirstNumberActionGroup title="Rent a Canadian number" flat>
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
                    // Carry the wizard position through the billing detour —
                    // without it the customer lands on /billing, goes to
                    // Stripe, returns to /billing, and has to find their way
                    // back into setup unaided.
                    billingLink={`/workspaces/${workspaceId}/billing?returnTo=${encodeURIComponent(rentReturnTo)}`}
                    onPurchaseComplete={handlePurchaseComplete}
                  />
                )}
              </FirstNumberActionGroup>
          ) : null}
          {numberStep === "verify" ? (
              <FirstNumberActionGroup title="Verify your own number">
                <p className="text-sm text-muted-foreground">
                  Keep your phone nearby for the verification call. This does not move your number to CallCaster.
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
              </FirstNumberActionGroup>
          ) : null}
          {numberStep === "rent" ? (
            <Button variant="outline" asChild>
              <Link to={`${firstNumberReturnTo}&numberStep=address`}>Back to service address</Link>
            </Button>
          ) : null}

          {/* Routing only after a rented number exists (#1114). */}
          {rentedNumbers.length > 0 && !isReadOnly ? (
            <div className="space-y-2 border-t border-border/60 pt-6">
              <div>
                <h3 className="font-medium">When someone calls your number</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose where incoming calls go for each rented number. You can change this later in Settings.
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
