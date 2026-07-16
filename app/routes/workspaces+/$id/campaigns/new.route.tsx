export { action } from "./new.action.server";

import { Form, Link, useActionData, useOutletContext } from "react-router";
import type { MetaFunction } from "react-router";
import { useState } from "react";
import {
  BrandedCard,
  BrandedCardActions,
  BrandedCardContent,
  BrandedCardTitle,
} from "@/components/shared/BrandedCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/typography";
import { hasMinRole, MemberRole } from "@/lib/member-role";

export const meta: MetaFunction = () => [{ title: "New Campaign — CallCaster" }];

const CREATION_SECTION_CLASS =
  "mx-auto w-full max-w-2xl px-4 pb-8 pt-6 sm:px-6";

export default function CampaignsNew() {
  const isLiveCallEnabled = true;
  const isMessageEnabled = true;
  const isRobocallEnabled = true;

  const { userRole } = useOutletContext<{ userRole?: string | null }>();
  // Creating a campaign is gated to Admin+ server-side (new.action.server.ts).
  // The nav entry point is already hidden for callers; this covers anyone who
  // still lands here directly (bookmark, shared link, back button) so the
  // write form isn't shown to a role that will always get a 403 on submit.
  const canCreate = hasMinRole(userRole ?? undefined, MemberRole.Admin);

  const actionData = useActionData<{ error?: unknown }>();
  const defaultType = isLiveCallEnabled
    ? "live_call"
    : isMessageEnabled
      ? "message"
      : "robocall";
  const [campaignType, setCampaignType] = useState(defaultType);
  const [nameMissing, setNameMissing] = useState(false);

  if (!canCreate) {
    return (
      <section id="form" className={CREATION_SECTION_CLASS}>
        <BrandedCard className="w-full" bgColor="bg-brand-secondary dark:bg-card">
          <BrandedCardTitle as="h1">Add Campaign</BrandedCardTitle>
          <BrandedCardContent>
            <Text variant="muted">
              Contact your workspace admin or owner to create a campaign.
            </Text>
          </BrandedCardContent>
          <BrandedCardActions>
            <Button asChild variant="outline" className="w-full">
              <Link to=".." relative="path">
                Back
              </Link>
            </Button>
          </BrandedCardActions>
        </BrandedCard>
      </section>
    );
  }

  return (
    <section id="form" className={CREATION_SECTION_CLASS}>
      {actionData?.error != null ? (
        <Text className="mb-4 text-center text-destructive">
          Error:{" "}
          {typeof actionData.error === "object" &&
          actionData.error !== null &&
          "message" in actionData.error
            ? String(actionData.error.message)
            : String(actionData.error)}
        </Text>
      ) : null}
      <BrandedCard className="w-full" bgColor="bg-brand-secondary dark:bg-card">
        <BrandedCardTitle as="h1">Add Campaign</BrandedCardTitle>
        <Form method="POST" className="space-y-6">
          <BrandedCardContent>
            <input type="hidden" name="formAction" value="newCampaign" />
            <FormField
              htmlFor="campaign-name"
              label="Campaign Name"
              error={nameMissing ? "Campaign name is required." : undefined}
            >
              <Input
                type="text"
                name="campaign-name"
                id="campaign-name"
                required
                aria-invalid={nameMissing || undefined}
                onInvalid={(e) => {
                  e.preventDefault();
                  setNameMissing(true);
                }}
                onChange={(e) => {
                  if (e.target.value.trim()) setNameMissing(false);
                }}
              />
            </FormField>
            <FormField htmlFor="campaign-type-trigger" label="Campaign Type">
              <input type="hidden" name="campaign-type" value={campaignType} />
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger id="campaign-type-trigger" data-testid="campaign-type">
                  <SelectValue placeholder="Select campaign type" />
                </SelectTrigger>
                <SelectContent>
                  {isLiveCallEnabled ? (
                    <SelectItem value="live_call">Live Call</SelectItem>
                  ) : null}
                  {isMessageEnabled ? (
                    <SelectItem value="message">Message</SelectItem>
                  ) : null}
                  {isRobocallEnabled ? (
                    <SelectItem value="robocall">
                      Interactive Voice Recording
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </FormField>
          </BrandedCardContent>
          <BrandedCardActions>
            <Button
              size="lg"
              className="w-full bg-brand-primary font-Zilla-Slab text-white hover:bg-brand-secondary"
              type="submit"
            >
              Add Campaign
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to=".." relative="path">
                Back
              </Link>
            </Button>
          </BrandedCardActions>
        </Form>
      </BrandedCard>
    </section>
  );
}
