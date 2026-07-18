export { action } from "./new.action.server";

import {
  useActionData,
  useNavigation,
  useParams,
  useSearchParams,
  useSubmit,
} from "react-router";
import { useState } from "react";
import { MdArrowForward, MdCheck } from "react-icons/md";
import { Section } from "@/components/shared/Section";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { Text } from "@/components/ui/typography";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AudienceUploader from "@/components/audience/AudienceUploader";
import { validatePeopleReturnPath } from "@/lib/people-return-path";

export default function AudiencesNew() {
  const actionData = useActionData();
  const params = useParams();
  const workspaceId = params.id;
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const [searchParams] = useSearchParams();
  const initialStep = searchParams.get("step") === "upload" ? 2 : 1;
  const initialName = searchParams.get("name") ?? "";
  const campaignId = searchParams.get("campaignId") ?? undefined;
  const returnTo = workspaceId
    ? validatePeopleReturnPath(searchParams.get("returnTo"), workspaceId)
    : null;

  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [audienceName, setAudienceName] = useState(initialName);
  
  const handleCreateAudience = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!audienceName) {
      return;
    }
    
    const formData = new FormData();
    formData.append("formAction", "createAudience");
    formData.append("audience-name", audienceName);
    if (campaignId) formData.append("campaign-id", campaignId);
    if (returnTo) formData.append("return-to", returnTo);
    
    submit(formData, { method: "POST" });
  };

  const goToNextStep = () => {
    setCurrentStep(prev => prev + 1);
  };

  const goToPreviousStep = () => {
    setCurrentStep(prev => prev - 1);
  };

  return (
    <section id="form" className="px-4 pb-8 pt-6 sm:px-6">
      <PageShell title="Add a Call list" maxWidth="narrow">
        {actionData?.error ? (
          <Text className="text-center text-destructive">
            Error: {actionData.error}
          </Text>
        ) : null}
        <Tabs value={`step-${currentStep}`} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger 
              value="step-1" 
              disabled={currentStep !== 1}
              className={currentStep > 1 ? "text-green-800" : ""}
            >
              {currentStep > 1 && <MdCheck className="mr-1" />}
              Name
            </TabsTrigger>
            <TabsTrigger 
              value="step-2" 
              disabled={currentStep !== 2}
              className={currentStep > 2 ? "text-green-800" : ""}
            >
              {currentStep > 2 && <MdCheck className="mr-1" />}
              Upload
            </TabsTrigger>
            <TabsTrigger 
              value="step-3" 
              disabled={currentStep !== 3}
            >
              Process
            </TabsTrigger>
          </TabsList>

          {currentStep === 1 ? (
            <Section variant="flat" className="space-y-4">
              <form onSubmit={handleCreateAudience} className="space-y-6">
                <FormField htmlFor="audience-name" label="Call list name">
                  <Input
                    type="text"
                    name="audience-name"
                    id="audience-name"
                    aria-label="Call list name"
                    defaultValue=""
                    onChange={(e) => setAudienceName(e.target.value)}
                    required
                  />
                </FormField>

                <Button
                  type="submit"
                  disabled={!audienceName || isSubmitting}
                  className="bg-brand-primary text-white hover:bg-brand-secondary"
                >
                  Create Call list
                </Button>
              </form>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.history.back()}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  data-testid="audience-next-upload"
                  onClick={() => {
                    const input = document.getElementById(
                      "audience-name",
                    ) as HTMLInputElement | null;
                    const trimmed = input?.value.trim();
                    if (trimmed) setAudienceName(trimmed);
                    goToNextStep();
                  }}
                  className="bg-brand-primary text-white hover:bg-brand-secondary"
                >
                  Next: Upload Contacts <MdArrowForward className="ml-2" />
                </Button>
              </div>
            </Section>
          ) : null}

          {currentStep === 2 ? (
            <Section variant="flat" className="space-y-4">
              <div className="mb-4 text-center" data-testid="audience-upload-step">
                <h3 className="text-lg font-medium">Upload Contacts</h3>
                <Text variant="muted" className="text-center">
                  Upload a CSV file with your contacts. You'll be able to map the columns in the next step.
                </Text>
              </div>
              
              <div className="space-y-6">
                <AudienceUploader 
                  audienceName={audienceName}
                  campaignId={campaignId}
                  returnTo={returnTo}
                />
                
                <div className="flex items-center justify-between gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToPreviousStep}
                  >
                    Back
                  </Button>
                </div>
              </div>
            </Section>
          ) : null}

          {currentStep === 3 ? (
            <Section variant="flat" className="space-y-4">
              <div className="text-center">
                <h3 className="mb-2 text-lg font-medium">Upload Complete</h3>
                <Text variant="muted">
                  Your Call list is ready and contacts are being processed.
                </Text>
              </div>
            </Section>
          ) : null}
        </Tabs>
      </PageShell>
    </section>
  );
}
