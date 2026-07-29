export { action } from "./new.action.server";

import {
  useActionData,
  useNavigate,
  useParams,
  useSearchParams,
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
  const navigate = useNavigate();

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
  const [completedAudienceId, setCompletedAudienceId] = useState<string | null>(
    null,
  );
  
  // Single forward path (#1060): name the list, then upload. The audience row
  // is created by the upload API once contacts are submitted, so an empty name
  // can never reach the server (#1080).
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = audienceName.trim();
    if (!trimmed) return;
    setAudienceName(trimmed);
    setCurrentStep(2);
  };

  return (
    <section id="form">
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
              <form onSubmit={handleNameSubmit} className="space-y-6">
                <FormField htmlFor="audience-name" label="Call list name">
                  <Input
                    type="text"
                    name="audience-name"
                    id="audience-name"
                    aria-label="Call list name"
                    value={audienceName}
                    onChange={(e) => setAudienceName(e.target.value)}
                    required
                  />
                </FormField>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.history.back()}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    data-testid="audience-next-upload"
                    disabled={!audienceName.trim()}
                    className="bg-brand-primary text-white hover:bg-brand-secondary"
                  >
                    Next: Upload Contacts <MdArrowForward className="ml-2" />
                  </Button>
                </div>
              </form>
            </Section>
          ) : null}

          {currentStep === 2 ? (
            <Section variant="flat" className="space-y-4">
              <div className="mb-4 text-center" data-testid="audience-upload-step">
                <h3 className="text-lg font-medium">Upload Contacts</h3>
              </div>
              
              <div className="space-y-6">
                <AudienceUploader
                  audienceName={audienceName}
                  campaignId={campaignId}
                  returnTo={returnTo}
                  onUploadComplete={(audienceId) => {
                    setCompletedAudienceId(audienceId);
                    setCurrentStep(3);
                  }}
                />
              </div>
            </Section>
          ) : null}

          {currentStep === 3 ? (
            <Section variant="flat" className="space-y-4">
              <div className="text-center space-y-4">
                <h3 className="mb-2 text-lg font-medium">Upload Complete</h3>
                <Text variant="muted">
                  Your Call list is ready and contacts are being processed.
                </Text>
                <Button
                  type="button"
                  className="bg-brand-primary text-white hover:bg-brand-secondary"
                  onClick={() => {
                    if (!workspaceId || !completedAudienceId) return;
                    navigate(
                      returnTo ??
                        `/workspaces/${workspaceId}/audiences/${completedAudienceId}`,
                    );
                  }}
                >
                  {returnTo ? "Continue setup" : "View Call list"}
                </Button>
              </div>
            </Section>
          ) : null}
        </Tabs>
      </PageShell>
    </section>
  );
}
