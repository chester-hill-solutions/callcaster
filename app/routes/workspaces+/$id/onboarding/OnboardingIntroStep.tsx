import { Form } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section, SectionHeader } from "@/components/shared/Section";

type OnboardingIntroStepProps = {
  workspaceName: string;
  isReadOnly: boolean;
  isSaving: boolean;
  error?: string | null;
};

export function OnboardingIntroStep({
  workspaceName,
  isReadOnly,
  isSaving,
  error,
}: OnboardingIntroStepProps) {
  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="Name your workspace"
        description="Choose the name your team will see across campaigns, contacts, and billing."
      />
      <div className="max-w-2xl">
        {isReadOnly ? (
          <p className="text-sm text-muted-foreground">
            Workspace name: <span className="font-medium text-foreground">{workspaceName}</span>
          </p>
        ) : (
          <Form method="post" className="space-y-6">
            <input type="hidden" name="_action" value="save_workspace_name" />
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <FormField
              htmlFor="workspaceName"
              label="Workspace name"
              required
            >
              <Input
                id="workspaceName"
                name="workspaceName"
                type="text"
                defaultValue={workspaceName}
                maxLength={200}
                required
                autoComplete="organization"
                disabled={isSaving}
                aria-invalid={Boolean(error) || undefined}
              />
            </FormField>
            <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
              {isSaving ? "Saving…" : "Continue"}
            </Button>
          </Form>
        )}
      </div>
    </Section>
  );
}
