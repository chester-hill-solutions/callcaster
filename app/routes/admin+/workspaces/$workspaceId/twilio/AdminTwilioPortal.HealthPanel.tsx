import { Form } from "react-router";
import { Activity, RefreshCw, Wrench } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { TwilioPageData } from "../loadTwilioData.server";

type HealthPanelProps = Pick<TwilioPageData["portalSnapshot"], "onboarding" | "syncSnapshot">;

export function HealthPanel({ onboarding, syncSnapshot }: HealthPanelProps) {
  const drift = onboarding.subaccountBootstrap.driftMessages;
  const lastError =
    onboarding.subaccountBootstrap.lastError ?? onboarding.messagingService.lastError;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Twilio health</CardTitle>
            <CardDescription>
              Webhook drift, sender pool, A2P sync, and last Twilio errors for this workspace.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Form method="post">
              <input type="hidden" name="_action" value="audit_twilio_webhooks" />
              <Button variant="outline" type="submit" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Audit webhooks
              </Button>
            </Form>
            <Form method="post">
              <input type="hidden" name="_action" value="repair_twilio_webhooks" />
              <Button variant="outline" type="submit" size="sm">
                <Wrench className="mr-2 h-4 w-4" />
                Repair webhooks
              </Button>
            </Form>
            <Form method="post">
              <input type="hidden" name="_action" value="verify_sender_pool" />
              <Button variant="outline" type="submit" size="sm">
                <Activity className="mr-2 h-4 w-4" />
                Verify sender pool
              </Button>
            </Form>
            <Form method="post">
              <input type="hidden" name="_action" value="sync_a2p_status" />
              <Button variant="outline" type="submit" size="sm">
                Sync A2P status
              </Button>
            </Form>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4 text-sm">
            <div className="text-muted-foreground">Bootstrap status</div>
            <div className="mt-1 font-medium">{onboarding.subaccountBootstrap.status}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Last synced: {onboarding.subaccountBootstrap.lastSyncedAt ?? "Never"}
            </div>
          </div>
          <div className="rounded-lg border p-4 text-sm">
            <div className="text-muted-foreground">Open sync snapshot</div>
            <div className="mt-1 font-medium">
              {syncSnapshot.lastSyncedAt ? "Available" : "Not synced"}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {syncSnapshot.lastSyncedAt ?? "Run workspace Twilio sync for usage snapshot."}
            </div>
          </div>
        </div>

        {lastError ? (
          <Alert variant="destructive">
            <AlertTitle>Last Twilio error</AlertTitle>
            <AlertDescription>{lastError}</AlertDescription>
          </Alert>
        ) : null}

        {drift.length > 0 ? (
          <Alert>
            <AlertTitle>Webhook / config drift ({drift.length})</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {drift.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">No drift messages recorded in onboarding state.</p>
        )}
      </CardContent>
    </Card>
  );
}
