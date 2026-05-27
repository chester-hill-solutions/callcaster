import { Link, useFetcher, useRevalidator } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { NumberPurchase } from "@/components/phone-numbers/NumberPurchase";
import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";
import { CallerIdVerificationDialog } from "@/components/phone-numbers/CallerIdVerificationDialog";
import { CallerIdVerificationForm } from "@/components/phone-numbers/CallerIdVerificationForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  countRentedWorkspaceNumbers,
  countVerifiedCallerIdNumbers,
  isVerifiedCallerIdNumber,
  workspaceHasFirstNumber,
} from "@/lib/messaging-onboarding.server";
import type { OnboardingActionData } from "../onboarding.action.server";
import type { OnboardingStepProps } from "./types";

type OnboardingFirstNumberStepProps = Pick<
  OnboardingStepProps,
  "onboarding" | "workspaceId" | "phoneNumbers" | "isReadOnly"
> & {
  creditsBalance: number;
};

export function OnboardingFirstNumberStep({
  onboarding,
  workspaceId,
  phoneNumbers,
  creditsBalance,
  isReadOnly,
}: OnboardingFirstNumberStepProps) {
  const purchaseFetcher = useFetcher<NumbersSearchFetcherData>();
  const verifyFetcher = useFetcher<OnboardingActionData>();
  const revalidator = useRevalidator();
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);

  const numbers = phoneNumbers ?? [];
  const rentedCount = countRentedWorkspaceNumbers(numbers);
  const verifiedCallerIdCount = countVerifiedCallerIdNumbers(numbers);
  const hasFirstNumber = workspaceHasFirstNumber(numbers);
  const pendingCallerIds = numbers.filter(
    (number) =>
      number.type === "caller_id" &&
      !isVerifiedCallerIdNumber(number) &&
      number.capabilities &&
      typeof number.capabilities === "object" &&
      !Array.isArray(number.capabilities) &&
      (number.capabilities as Record<string, unknown>).verification_status === "pending",
  );
  const messagingReady = Boolean(onboarding.messagingService.serviceSid);

  const handlePurchaseComplete = useCallback(() => {
    revalidator.revalidate();
  }, [revalidator]);

  useEffect(() => {
    if (verifyFetcher.data?.validationRequest) {
      setVerificationDialogOpen(true);
    }
  }, [verifyFetcher.data?.validationRequest]);

  useEffect(() => {
    if (verifyFetcher.state === "idle" && verifyFetcher.data?.success && hasFirstNumber) {
      revalidator.revalidate();
    }
  }, [hasFirstNumber, revalidator, verifyFetcher.data?.success, verifyFetcher.state]);

  if (!messagingReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your first number</CardTitle>
          <CardDescription>
            Provision the Messaging Service first, then add a phone number to send and receive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Complete the Messaging Service step before searching for numbers.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <CallerIdVerificationDialog
        isOpen={verificationDialogOpen}
        onOpenChange={setVerificationDialogOpen}
        validationRequest={verifyFetcher.data?.validationRequest}
      />
      <Card>
        <CardHeader>
          <CardTitle>Your first number</CardTitle>
          <CardDescription>
            Rent a Canadian local number for full inbound SMS and calls, or verify a number you
            already own for outbound messaging and calling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
                Continue to provider setup, or add another number below.
              </AlertDescription>
            </Alert>
          ) : null}

          {pendingCallerIds.length > 0 ? (
            <Alert>
              <AlertDescription>
                {pendingCallerIds.length} number
                {pendingCallerIds.length === 1 ? " is" : "s are"} awaiting verification. Complete
                the phone call and enter the code, then refresh this page.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <h3 className="font-medium">Rent a Canadian number</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Best for inbound SMS, inbound calls, and full two-way messaging.
                </p>
              </div>
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
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <h3 className="font-medium">Verify your own number</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use a phone number you already own. Verified numbers work for outbound SMS and
                  calls, but not for inbound SMS or calls. Rent a number above if you need inbound
                  traffic.
                </p>
              </div>
              {isReadOnly ? (
                <p className="text-sm text-muted-foreground">
                  Only workspace owners and admins can verify numbers. Ask an admin to complete this
                  step.
                </p>
              ) : (
                <CallerIdVerificationForm
                  formId="onboarding-caller-id-form"
                  actionName="verify_caller_id"
                  disabled={verifyFetcher.state !== "idle"}
                  isPending={verifyFetcher.state !== "idle"}
                  fetcher={verifyFetcher}
                />
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Manage numbers later in{" "}
            <Link className="underline" to={`/workspaces/${workspaceId}/settings/numbers`}>
              Settings
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </>
  );
}
