import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingStepProps } from "./types";

export function OnboardingOverviewCard({
  onboarding,
  readiness,
  workspaceId,
  workspaceName,
  phoneNumbers,
}: Pick<
  OnboardingStepProps,
  "onboarding" | "readiness" | "workspaceId" | "workspaceName" | "phoneNumbers"
>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Messaging onboarding for {workspaceName}</CardTitle>
        <CardDescription>
          Start with clear business details, then choose the channels and provider setup this workspace actually needs.
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
          <Badge variant={readiness.legacyMode ? "outline" : "secondary"}>
            {readiness.legacyMode ? "Legacy compatibility mode" : "New workspace flow"}
          </Badge>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Write each answer as if a carrier reviewer has never seen your business before. Use plain language, avoid internal shorthand, and be specific about what customers sign up for.
        </div>
        {readiness.warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {readiness.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            This workspace is aligned with the current onboarding readiness checks.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {onboarding.steps.map((step) => (
            <div key={step.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{step.label}</div>
                <Badge variant={step.status === "complete" ? "secondary" : "outline"}>
                  {step.status}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description ?? "No details yet."}
              </p>
            </div>
          ))}
        </div>
        <div className="text-sm text-muted-foreground">
          Workspace numbers on file: {Array.isArray(phoneNumbers) ? phoneNumbers.length : 0}.{" "}
          <Link className="underline" to={`/workspaces/${workspaceId}/settings/numbers`}>
            Manage numbers
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
