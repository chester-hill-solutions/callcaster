export { action } from "./new.action.server";

import { Form, Link, useActionData } from "react-router";
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

export default function CampaignsNew() {
  const isLiveCallEnabled = true;
  const isMessageEnabled = true;
  const isRobocallEnabled = true;

  const actionData = useActionData<{ error?: unknown }>();

  return (
    <section
      id="form"
      className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center"
    >
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
      <BrandedCard bgColor="bg-brand-secondary dark:bg-card">
        <BrandedCardTitle>Add Campaign</BrandedCardTitle>
        <Form method="POST" className="space-y-6">
          <BrandedCardContent>
            <input type="hidden" name="formAction" value="newCampaign" />
            <FormField htmlFor="campaign-name" label="Campaign Name">
              <Input type="text" name="campaign-name" id="campaign-name" />
            </FormField>
            <FormField htmlFor="campaign-type" label="Campaign Type">
              <select
                id="campaign-type"
                name="campaign-type"
                required
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                {isLiveCallEnabled ? (
                  <option value="live_call">Live Call</option>
                ) : null}
                {isMessageEnabled ? (
                  <option value="message">Message</option>
                ) : null}
                {isRobocallEnabled ? (
                  <option value="robocall">Interactive Voice Recording</option>
                ) : null}
              </select>
            </FormField>
          </BrandedCardContent>
          <BrandedCardActions>
            <div className="flex items-center gap-4">
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
            </div>
          </BrandedCardActions>
        </Form>
      </BrandedCard>
    </section>
  );
}
