import { Form } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberRentalCreditsAlert } from "@/components/phone-numbers/NumberRentalCreditsAlert";
import { hasCreditsForNumberRental } from "@/lib/number-rental";
import type { OnboardingStepProps } from "./types";

export function OnboardingMessagingServiceStep({
  formId = "onboarding-messaging-form",
  onboarding,
  isReadOnly,
  pending,
  workspaceId,
  creditsBalance,
}: Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending"> & {
  formId?: string;
  workspaceId: string;
  creditsBalance: number;
}) {
  const { isBootstrappingMessagingService } = pending;
  const messagingProvisioned = Boolean(onboarding.messagingService.serviceSid);
  const bootstrapFailed = onboarding.subaccountBootstrap.status === "rejected";
  const bootstrapPartial =
    messagingProvisioned &&
    Boolean(
      onboarding.messagingService.lastError ||
        onboarding.subaccountBootstrap.lastError ||
        onboarding.subaccountBootstrap.driftMessages.length > 0,
    );
  const bootstrapErrors = [
    onboarding.messagingService.lastError,
    onboarding.subaccountBootstrap.lastError,
    ...onboarding.subaccountBootstrap.driftMessages,
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const firstNumberComplete =
    onboarding.steps.find((step) => step.id === "first_number")?.status === "complete";
  const showCreditsPrompt =
    messagingProvisioned &&
    !firstNumberComplete &&
    !hasCreditsForNumberRental(creditsBalance);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messaging Service</CardTitle>
        <CardDescription>
          Provision the shared Messaging Service used to send messages from this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          This step creates the shared Twilio messaging container that later registration and sender attachment will rely on.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Desired send mode</div>
            <div className="mt-1 font-medium">{onboarding.messagingService.desiredSendMode}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Messaging Service SID</div>
            <div className="mt-1 font-mono text-sm">
              {onboarding.messagingService.serviceSid ?? "Not provisioned yet"}
            </div>
          </div>
          <div className="rounded-lg border p-4 md:col-span-2">
            <div className="text-sm text-muted-foreground">Bootstrap status</div>
            <div className="mt-1 font-medium">{onboarding.subaccountBootstrap.status}</div>
            {onboarding.subaccountBootstrap.callbackBaseUrl ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Callback base: {onboarding.subaccountBootstrap.callbackBaseUrl}
              </div>
            ) : null}
          </div>
        </div>
        {bootstrapErrors.length > 0 ? (
          <div
            className={`rounded-lg border p-4 text-sm ${
              bootstrapFailed
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100"
            }`}
          >
            <p className="font-medium">
              {bootstrapFailed
                ? "Messaging Service provisioning failed"
                : bootstrapPartial
                  ? "Messaging Service needs attention"
                  : "Provisioning issue"}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {bootstrapErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {showCreditsPrompt ? (
          <NumberRentalCreditsAlert
            creditsBalance={creditsBalance}
            billingLink={`/workspaces/${workspaceId}/billing`}
            title="Next up: rent a number"
          />
        ) : null}
        {!isReadOnly && (!messagingProvisioned || bootstrapFailed || bootstrapPartial) ? (
          <Form id={formId} method="post">
            <input type="hidden" name="_action" value="bootstrap_messaging_service" />
            <Button
              type="submit"
              disabled={isBootstrappingMessagingService}
              aria-busy={isBootstrappingMessagingService}
              variant={bootstrapFailed || bootstrapPartial ? "outline" : "default"}
            >
              {isBootstrappingMessagingService
                ? "Provisioning Messaging Service..."
                : messagingProvisioned
                  ? "Retry Messaging Service setup"
                  : "Provision Messaging Service"}
            </Button>
          </Form>
        ) : null}
      </CardContent>
    </Card>
  );
}
