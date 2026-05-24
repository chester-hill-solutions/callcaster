import { Form } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CHANNEL_OPTIONS } from "./constants";
import type { OnboardingStepProps } from "./types";

export function OnboardingChannelsStep({
  onboarding,
  isReadOnly,
  pending,
}: Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending">) {
  const { isSavingChannels } = pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Choose channels</CardTitle>
        <CardDescription>
          After the business details are in place, choose which tracks we should prepare for this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="_action" value="save_channels" />
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Keep this focused. Only enable the channels or compliance tracks the workspace will actually use in the near term.
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {CHANNEL_OPTIONS.map((option) => (
              <div key={option.id} className="rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <input
                    id={`channel-${option.id}`}
                    type="checkbox"
                    name="selectedChannels"
                    value={option.id}
                    defaultChecked={onboarding.selectedChannels.includes(option.id)}
                    disabled={isReadOnly}
                  />
                  <div>
                    <Label htmlFor={`channel-${option.id}`} className="font-medium">
                      {option.label}
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!isReadOnly ? (
            <Button type="submit" disabled={isSavingChannels} aria-busy={isSavingChannels}>
              {isSavingChannels ? "Saving channel selection..." : "Save channel selection"}
            </Button>
          ) : null}
        </Form>
      </CardContent>
    </Card>
  );
}
