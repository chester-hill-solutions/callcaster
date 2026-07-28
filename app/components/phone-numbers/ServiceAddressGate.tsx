import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";

function addressComplete(
  address: WorkspaceMessagingOnboardingState["emergencyVoice"]["address"],
): boolean {
  return Boolean(
    address.street.trim() &&
      address.city.trim() &&
      address.region.trim() &&
      address.postalCode.trim(),
  );
}

type ServiceAddressGateProps = {
  workspaceId: string;
  onboarding: WorkspaceMessagingOnboardingState;
  isReadOnly?: boolean;
  /** Where save/validate should return; defaults to Numbers settings. */
  returnTo?: string;
};

export function isServiceAddressComplete(
  address: WorkspaceMessagingOnboardingState["emergencyVoice"]["address"],
): boolean {
  return addressComplete(address);
}

/**
 * Capability gate: collect the service / emergency address before renting.
 * Posts to the workspace onboarding action (`save_service_address`).
 *
 * When complete, shows a compact summary until the user chooses Edit (#1112).
 * Nested under the phone-number step without a second page-level heading (#1111).
 */
export function ServiceAddressGate({
  workspaceId,
  onboarding,
  isReadOnly = false,
  returnTo,
}: ServiceAddressGateProps) {
  const navigation = useNavigation();
  const address = onboarding.emergencyVoice.address;
  const complete = addressComplete(address);
  const [isEditing, setIsEditing] = useState(!complete);
  const pendingAction =
    navigation.state === "idle"
      ? null
      : String(navigation.formData?.get("_action") ?? "");
  const isSaving = pendingAction === "save_service_address";
  const isReviewing = pendingAction === "review_emergency_voice";
  const returnPath =
    returnTo ?? `/workspaces/${workspaceId}/settings/numbers`;
  const showForm = !complete || isEditing;

  return (
    <div data-testid="service-address-gate" className="max-w-xl space-y-3">
      <div>
        <h3 className="text-sm font-medium">Service address</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {complete && !isEditing
            ? "Required before renting a phone number."
            : "Add a physical service address before renting a number. PO boxes are not accepted."}
        </p>
      </div>

      {complete && !isEditing ? (
        <div className="space-y-3 rounded-md bg-muted/40 p-3 text-sm">
          <p className="text-foreground">
            {[address.street, address.city, address.region, address.postalCode]
              .filter(Boolean)
              .join(", ")}
            {address.countryCode ? ` (${address.countryCode})` : null}
          </p>
          <p className="text-muted-foreground">
            Status:{" "}
            <span className="font-medium text-foreground">
              {address.status.replaceAll("_", " ")}
            </span>
            {address.validationError ? ` — ${address.validationError}` : null}
          </p>
          {!isReadOnly ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Edit address
              </Button>
              <Form
                method="post"
                action={`/workspaces/${workspaceId}/onboarding`}
              >
                <input type="hidden" name="_action" value="review_emergency_voice" />
                <input type="hidden" name="returnTo" value={returnPath} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={isReviewing}
                  aria-busy={isReviewing}
                >
                  {isReviewing ? "Validating…" : "Validate address"}
                </Button>
              </Form>
            </div>
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <Form
          method="post"
          action={`/workspaces/${workspaceId}/onboarding`}
          className="grid max-w-xl gap-3"
        >
          <input type="hidden" name="_action" value="save_service_address" />
          <input type="hidden" name="returnTo" value={returnPath} />
          <FormField htmlFor="addressStreet" label="Street address" required>
            <Input
              id="addressStreet"
              name="addressStreet"
              defaultValue={address.street}
              disabled={isReadOnly || isSaving}
              required
              placeholder="123 Main St"
            />
          </FormField>
          <FormField htmlFor="addressCity" label="City" required>
            <Input
              id="addressCity"
              name="addressCity"
              defaultValue={address.city}
              disabled={isReadOnly || isSaving}
              required
              placeholder="Toronto"
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField htmlFor="addressRegion" label="Province or region" required>
              <Input
                id="addressRegion"
                name="addressRegion"
                defaultValue={address.region}
                disabled={isReadOnly || isSaving}
                required
                placeholder="ON"
              />
            </FormField>
            <FormField htmlFor="addressPostalCode" label="Postal code" required>
              <Input
                id="addressPostalCode"
                name="addressPostalCode"
                defaultValue={address.postalCode}
                disabled={isReadOnly || isSaving}
                required
                placeholder="M5V 2T6"
              />
            </FormField>
          </div>
          <FormField htmlFor="addressCountryCode" label="Country code">
            <Input
              id="addressCountryCode"
              name="addressCountryCode"
              defaultValue={address.countryCode || "CA"}
              disabled={isReadOnly || isSaving}
              placeholder="CA"
            />
          </FormField>
          {!isReadOnly ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
                {isSaving ? "Saving…" : complete ? "Update address" : "Save address"}
              </Button>
              {complete ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          ) : null}
        </Form>
      ) : null}
    </div>
  );
}
