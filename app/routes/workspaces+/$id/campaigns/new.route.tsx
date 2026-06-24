export { action } from "./new.action.server";

import { Form, Link, useActionData } from "react-router";
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

const CREATION_SECTION_CLASS =
  "mx-auto w-full max-w-2xl px-2 py-6 sm:px-4";

export default function CampaignsNew() {
  const isLiveCallEnabled = true;
  const isMessageEnabled = true;
  const isRobocallEnabled = true;

  const actionData = useActionData<{ error?: unknown }>();
  const defaultType = isLiveCallEnabled
    ? "live_call"
    : isMessageEnabled
      ? "message"
      : "robocall";
  const [campaignType, setCampaignType] = useState(defaultType);

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
        <BrandedCardTitle>Add Campaign</BrandedCardTitle>
        <Form method="POST" className="space-y-6">
          <BrandedCardContent>
            <input type="hidden" name="formAction" value="newCampaign" />
            <FormField htmlFor="campaign-name" label="Campaign Name">
              <Input type="text" name="campaign-name" id="campaign-name" />
            </FormField>
            <FormField htmlFor="campaign-type" label="Campaign Type">
              <input type="hidden" name="campaign-type" value={campaignType} />
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger id="campaign-type">
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
