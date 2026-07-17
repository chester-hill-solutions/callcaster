export { action } from "./new.action.server";

import {
  Form,
  Link,
  useActionData,
  useOutletContext,
  useSearchParams,
} from "react-router";
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
import { Text } from "@/components/ui/typography";
import {
  CAMPAIGN_PRODUCT_GOAL_OPTIONS,
  CAMPAIGN_PRODUCT_GOAL_VALUES,
  type CampaignProductGoal,
} from "@/lib/campaign-goals";
import { hasMinRole, MemberRole } from "@/lib/member-role";

export const meta: MetaFunction = () => [{ title: "New Campaign — CallCaster" }];

const CREATION_SECTION_CLASS =
  "mx-auto w-full max-w-2xl px-4 pb-8 pt-6 sm:px-6";

export default function CampaignsNew() {
  const { userRole } = useOutletContext<{ userRole?: string | null }>();
  // Creating a campaign is gated to Admin+ server-side (new.action.server.ts).
  // The nav entry point is already hidden for callers; this covers anyone who
  // still lands here directly (bookmark, shared link, back button) so the
  // write form isn't shown to a role that will always get a 403 on submit.
  const canCreate = hasMinRole(userRole ?? undefined, MemberRole.Admin);

  const actionData = useActionData<{ error?: unknown }>();
  const [searchParams] = useSearchParams();
  const requestedGoal = searchParams.get("goal");
  const initialGoal = CAMPAIGN_PRODUCT_GOAL_VALUES.includes(
    requestedGoal as CampaignProductGoal,
  )
    ? (requestedGoal as CampaignProductGoal)
    : "live_calling";
  const [campaignGoal, setCampaignGoal] =
    useState<CampaignProductGoal>(initialGoal);
  const [nameMissing, setNameMissing] = useState(false);

  if (!canCreate) {
    return (
      <section id="form" className={CREATION_SECTION_CLASS}>
        <BrandedCard className="w-full" bgColor="bg-brand-secondary dark:bg-card">
          <BrandedCardTitle as="h1">Create campaign</BrandedCardTitle>
          <BrandedCardContent>
            <Text variant="muted">
              Contact a workspace administrator to create a campaign.
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
          {typeof actionData.error === "object" &&
          actionData.error !== null &&
          "message" in actionData.error
            ? String(actionData.error.message)
            : String(actionData.error)}
        </Text>
      ) : null}
      <BrandedCard className="w-full" bgColor="bg-brand-secondary dark:bg-card">
        <BrandedCardTitle as="h1">Create campaign</BrandedCardTitle>
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
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">What do you want to do?</legend>
              <div className="grid gap-3" data-testid="campaign-goals">
                {CAMPAIGN_PRODUCT_GOAL_OPTIONS.map((option) => {
                  const checked = campaignGoal === option.id;
                  return (
                    <label
                      key={option.id}
                      htmlFor={`campaign-goal-${option.id}`}
                      aria-label={`${option.label}: ${option.description}`}
                      className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                        checked
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "bg-background hover:border-primary/50"
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <input
                          id={`campaign-goal-${option.id}`}
                          type="radio"
                          name="campaign-goal"
                          value={option.id}
                          checked={checked}
                          onChange={() => setCampaignGoal(option.id)}
                          className="mt-1 h-4 w-4"
                          data-testid={`campaign-goal-${option.id}`}
                        />
                        <span>
                          <span className="block font-medium">{option.label}</span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </BrandedCardContent>
          <BrandedCardActions>
            <Button
              size="lg"
              className="w-full bg-brand-primary font-Zilla-Slab text-white hover:bg-brand-secondary"
              type="submit"
            >
              Create campaign
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
