import { useState } from "react";
import { Form } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_OPTIONS } from "./constants";
import type { OnboardingStepProps } from "./types";

/**
 * Channels that reveal channel-scoped inline fields when checked. The toll-free
 * bulk SMS path collects Twilio toll-free verification (TFV) inputs; the A2P
 * 10DLC path collects US Trust Hub brand inputs.
 */
const INLINE_FIELD_CHANNELS = new Set(["toll_free_bulk_sms", "a2p10dlc"]);

export function OnboardingChannelsStep({
  formId = "onboarding-channels-form",
  onboarding,
  isReadOnly,
  pending,
}: Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending"> & {
  formId?: string;
}) {
  const { isSavingChannels } = pending;
  const profile = onboarding.businessProfile;
  const country = onboarding.operatingCountry;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(onboarding.selectedChannels),
  );

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  // operatingCountry drives which optional paths we highlight. For "BOTH" both
  // paths are highlighted and neither is pre-checked.
  const isRelevantPath = (id: string): boolean => {
    if (id === "toll_free_bulk_sms") return country === "CA" || country === "BOTH";
    if (id === "a2p10dlc") return country === "US" || country === "BOTH";
    return false;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose channels</CardTitle>
        <CardDescription>
          After the business details are in place, choose which tracks we should prepare for this workspace. Enabling a
          compliance path reveals the details Twilio needs — we submit the registration for you automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form id={formId} method="post" className="space-y-4">
          <input type="hidden" name="_action" value="save_channels" />
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Keep this focused. Only enable the channels or compliance tracks the workspace will actually use in the near
            term.
          </div>
          <div className="space-y-4">
            {CHANNEL_OPTIONS.map((option) => {
              const checked = selected.has(option.id);
              const relevant = isRelevantPath(option.id);
              return (
                <div
                  key={option.id}
                  className={
                    relevant
                      ? "rounded-lg border border-primary/50 ring-1 ring-primary/30 p-4"
                      : "rounded-lg border p-4"
                  }
                >
                  <div className="flex items-start gap-3">
                    <input
                      id={`channel-${option.id}`}
                      type="checkbox"
                      name="selectedChannels"
                      value={option.id}
                      defaultChecked={onboarding.selectedChannels.includes(option.id)}
                      onChange={(event) => toggle(option.id, event.currentTarget.checked)}
                      disabled={isReadOnly}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`channel-${option.id}`} className="font-medium">
                          {option.label}
                        </Label>
                        {relevant ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Recommended for your region
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                  {INLINE_FIELD_CHANNELS.has(option.id) && checked ? (
                    <div className="mt-4 border-t pt-4">
                      {option.id === "toll_free_bulk_sms" ? (
                        <TollFreeInlineFields profile={profile} isReadOnly={isReadOnly} />
                      ) : null}
                      {option.id === "a2p10dlc" ? (
                        <A2pInlineFields profile={profile} isReadOnly={isReadOnly} />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
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

function TollFreeInlineFields({
  profile,
  isReadOnly,
}: {
  profile: OnboardingStepProps["onboarding"]["businessProfile"];
  isReadOnly: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Toll-free verification details</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="doingBusinessAs">Doing business as (DBA)</Label>
          <Input
            id="doingBusinessAs"
            name="doingBusinessAs"
            placeholder="Acme Health"
            defaultValue={profile.doingBusinessAs}
            disabled={isReadOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="businessRegistrationNumber">Business registration number (BN)</Label>
          <Input
            id="businessRegistrationNumber"
            name="businessRegistrationNumber"
            placeholder="123456789RC0001"
            defaultValue={profile.businessRegistrationNumber}
            disabled={isReadOnly}
          />
        </div>
      </div>
      <div className="flex items-start gap-3">
        {/* Hidden field ensures an unchecked box still posts a value. */}
        <input type="hidden" name="ageGatedContent" value="false" />
        <input
          id="ageGatedContent"
          type="checkbox"
          name="ageGatedContent"
          value="true"
          defaultChecked={profile.ageGatedContent}
          disabled={isReadOnly}
        />
        <div>
          <Label htmlFor="ageGatedContent" className="font-medium">
            Age-gated content
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Check this if the messaging program includes age-restricted content (alcohol, gambling, etc.).
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="channelSampleMessages">Sample messages</Label>
        <Textarea
          id="channelSampleMessages"
          name="channelSampleMessages"
          placeholder={"One sample message per line.\nInclude opt-out language where relevant."}
          defaultValue={profile.sampleMessages.join("\n")}
          disabled={isReadOnly}
        />
        <p className="text-xs text-muted-foreground">One message per line. Used for Twilio toll-free verification.</p>
      </div>
    </div>
  );
}

function A2pInlineFields({
  profile,
  isReadOnly,
}: {
  profile: OnboardingStepProps["onboarding"]["businessProfile"];
  isReadOnly: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">US Trust Hub / brand registration details</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ein">EIN (US tax ID)</Label>
          <Input
            id="ein"
            name="ein"
            placeholder="12-3456789"
            defaultValue={profile.ein}
            disabled={isReadOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            name="industry"
            placeholder="Healthcare"
            defaultValue={profile.industry}
            disabled={isReadOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="authorizedRepName">Authorized representative name</Label>
          <Input
            id="authorizedRepName"
            name="authorizedRepName"
            placeholder="Jordan Smith"
            defaultValue={profile.authorizedRepName}
            disabled={isReadOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="authorizedRepTitle">Authorized representative title</Label>
          <Input
            id="authorizedRepTitle"
            name="authorizedRepTitle"
            placeholder="Head of Operations"
            defaultValue={profile.authorizedRepTitle}
            disabled={isReadOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="authorizedRepEmail">Authorized representative email</Label>
          <Input
            id="authorizedRepEmail"
            name="authorizedRepEmail"
            type="email"
            placeholder="jordan@acmehealth.com"
            defaultValue={profile.authorizedRepEmail}
            disabled={isReadOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="authorizedRepPhone">Authorized representative phone</Label>
          <Input
            id="authorizedRepPhone"
            name="authorizedRepPhone"
            placeholder="+1 555 123 4567"
            defaultValue={profile.authorizedRepPhone}
            disabled={isReadOnly}
          />
        </div>
      </div>
    </div>
  );
}
