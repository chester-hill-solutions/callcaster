export { action } from "./new.action.server";

import { data as routeData, ActionFunctionArgs, redirect, Form, useActionData, useOutletContext, useParams, useSubmit, useNavigation } from "react-router";
import { useState } from "react";
import { MdArrowForward, MdCheck } from "react-icons/md";
import {
  BrandedCard,
  BrandedCardContent,
  BrandedCardTitle,
} from "@/components/shared/BrandedCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AudienceUploader from "@/components/audience/AudienceUploader";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export default function AudiencesNew() {
  const actionData = useActionData();
  const params = useParams();
  const workspaceId = params.id;
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(1);
  const [audienceName, setAudienceName] = useState("");
  
  // Get the Supabase client from context
  const { supabase } = useOutletContext<{ supabase: SupabaseClient<Database> }>();

  const handleCreateAudience = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!audienceName) {
      return;
    }
    
    const formData = new FormData();
    formData.append("formAction", "createAudience");
    formData.append("audience-name", audienceName);
    
    submit(formData, { method: "POST" });
  };

  const goToNextStep = () => {
    setCurrentStep(prev => prev + 1);
  };

  const goToPreviousStep = () => {
    setCurrentStep(prev => prev - 1);
  };

  return (
    <section
      id="form"
      className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center"
    >
      <BrandedCard bgColor="bg-brand-secondary dark:bg-card w-[60vw]">
        <BrandedCardTitle>Add an Audience</BrandedCardTitle>
        {actionData?.error ? (
          <Text className="text-center text-destructive">
            Error: {actionData.error}
          </Text>
        ) : null}
        <BrandedCardContent>
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
            
            <TabsContent value="step-1" className="space-y-4">
              <form onSubmit={handleCreateAudience} className="space-y-6">
                <FormField htmlFor="audience-name" label="Audience Name">
                  <Input
                    type="text"
                    name="audience-name"
                    id="audience-name"
                    value={audienceName}
                    onChange={(e) => setAudienceName(e.target.value)}
                    required
                  />
                </FormField>
                
                <div className="flex items-center justify-between gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.history.back()}
                  >
                    Cancel
                  </Button>
                  
                  <div className="flex items-center gap-4">
                    <Button
                      type="submit"
                      disabled={!audienceName || isSubmitting}
                      className="bg-brand-primary text-white hover:bg-brand-secondary"
                    >
                      Create Empty Audience
                    </Button>
                    
                    <Button
                      type="button"
                      onClick={goToNextStep}
                      disabled={!audienceName}
                      className="bg-brand-primary text-white hover:bg-brand-secondary"
                    >
                      Next: Upload Contacts <MdArrowForward className="ml-2" />
                    </Button>
                  </div>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="step-2" className="space-y-4">
              <div className="text-center mb-4">
                <h3 className="text-lg font-medium">Upload Contacts</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Upload a CSV file with your contacts. You'll be able to map the columns in the next step.
                </p>
              </div>
              
              <div className="space-y-6">
                <AudienceUploader 
                  audienceName={audienceName}
                  supabase={supabase}
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
            </TabsContent>
            
            <TabsContent value="step-3" className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">Upload Complete</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Your audience has been created and contacts are being processed.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </BrandedCardContent>
      </BrandedCard>
    </section>
  );
}
