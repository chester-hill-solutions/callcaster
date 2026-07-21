import { Form, useNavigation } from "react-router";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section, SectionHeader } from "@/components/shared/Section";
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
  const pendingAction =
    navigation.state === "idle"
      ? null
      : String(navigation.formData?.get("_action") ?? "");
  const isSaving = pendingAction === "save_service_address";
  const isReviewing = pendingAction === "review_emergency_voice";
  const returnPath =
    returnTo ?? `/workspaces/${workspaceId}/settings/numbers`;

  return (
    <Section variant="flat" data-testid="service-address-gate">
      <SectionHeader
        compact
        title="Service address"
        description={
          complete
            ? "Required before renting a phone number. Validate the address so voice numbers can be emergency-ready."
            : "Add a physical service address before renting a number. PO boxes are not accepted."
        }
      />
      <Form
        method="post"
        action={`/workspaces/${workspaceId}/onboarding`}
        className="grid gap-4 md:grid-cols-2"
      >
        <input type="hidden" name="_action" value="save_service_address" />
        <input type="hidden" name="returnTo" value={returnPath} />
        <FormField
          className="md:col-span-2"
          htmlFor="addressStreet"
          label="Street address"
          required
        >
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
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
              {isSaving ? "Saving…" : complete ? "Update address" : "Save address"}
            </Button>
          </div>
        ) : null}
      </Form>
      {complete && !isReadOnly ? (
        <Form
          method="post"
          action={`/workspaces/${workspaceId}/onboarding`}
          className="mt-4"
        >
          <input type="hidden" name="_action" value="review_emergency_voice" />
          <input type="hidden" name="returnTo" value={returnPath} />
          <p className="mb-2 text-sm text-muted-foreground">
            Address status:{" "}
            <span className="font-medium text-foreground">
              {address.status.replaceAll("_", " ")}
            </span>
            {address.validationError ? ` — ${address.validationError}` : null}
          </p>
          <Button
            type="submit"
            variant="outline"
            disabled={isReviewing}
            aria-busy={isReviewing}
          >
            {isReviewing ? "Validating…" : "Validate address"}
          </Button>
        </Form>
      ) : null}
    </Section>
  );
}
