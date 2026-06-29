import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  countRentedWorkspaceNumbers,
  countVerifiedCallerIdNumbers,
  workspaceHasFirstNumber,
} from "@/lib/messaging-onboarding/predicates";
import type { OnboardingStepProps } from "./types";

function formatPhoneNumberBadge(
  rentedCount: number,
  verifiedCallerIdCount: number,
): string {
  if (rentedCount > 0 && verifiedCallerIdCount > 0) {
    return `${rentedCount} rented, ${verifiedCallerIdCount} verified`;
  }
  if (rentedCount > 0) {
    return `${rentedCount} rented number${rentedCount === 1 ? "" : "s"}`;
  }
  if (verifiedCallerIdCount > 0) {
    return `${verifiedCallerIdCount} verified number${verifiedCallerIdCount === 1 ? "" : "s"}`;
  }
  return "No phone number";
}

export function OnboardingLaunchStep({
  onboarding,
  readiness,
  workspaceId,
  phoneNumbers,
}: Pick<OnboardingStepProps, "onboarding" | "readiness" | "workspaceId" | "phoneNumbers">) {
  const numbers = phoneNumbers ?? [];
  const rentedCount = countRentedWorkspaceNumbers(numbers);
  const verifiedCallerIdCount = countVerifiedCallerIdNumbers(numbers);
  const hasFirstNumber = workspaceHasFirstNumber(numbers);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & launch</CardTitle>
        <CardDescription>
          Confirm readiness before you start campaigns and outbound messaging.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={readiness.messagingReady ? "secondary" : "outline"}>
            {readiness.messagingReady ? "Messaging ready" : "Messaging setup needed"}
          </Badge>
          <Badge variant={readiness.voiceReady ? "secondary" : "outline"}>
            {readiness.voiceReady ? "Voice ready" : "Voice compliance needed"}
          </Badge>
          <Badge variant={hasFirstNumber ? "secondary" : "outline"}>
            {formatPhoneNumberBadge(rentedCount, verifiedCallerIdCount)}
          </Badge>
        </div>
        {readiness.warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {readiness.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            This workspace meets the current onboarding readiness checks.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {onboarding.steps
            .filter((step) =>
              [
                "business_profile",
                "messaging_service",
                "first_number",
                "provider_provisioning",
                "launch_checks",
              ].includes(step.id),
            )
            .map((step) => (
              <div key={step.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{step.label}</span>
                  <Badge variant={step.status === "complete" ? "secondary" : "outline"}>
                    {step.status}
                  </Badge>
                </div>
              </div>
            ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/workspaces/${workspaceId}`}>Go to workspace</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/workspaces/${workspaceId}/settings/numbers`}>Manage numbers</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
