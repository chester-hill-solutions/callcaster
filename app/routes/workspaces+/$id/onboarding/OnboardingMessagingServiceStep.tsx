import { Form } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingStepProps } from "./types";

export function OnboardingMessagingServiceStep({
  onboarding,
  isReadOnly,
  pending,
}: Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending">) {
  const { isBootstrappingMessagingService } = pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Messaging Service bootstrap</CardTitle>
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
        </div>
        {!isReadOnly ? (
          <Form method="post">
            <input type="hidden" name="_action" value="bootstrap_messaging_service" />
            <Button
              type="submit"
              disabled={isBootstrappingMessagingService}
              aria-busy={isBootstrappingMessagingService}
            >
              {isBootstrappingMessagingService
                ? "Provisioning Messaging Service..."
                : "Provision Messaging Service"}
            </Button>
          </Form>
        ) : null}
      </CardContent>
    </Card>
  );
}
