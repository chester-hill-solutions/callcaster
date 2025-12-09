import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, useActionData, useOutletContext, useParams, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { MdArrowForward, MdCheck } from "react-icons/md";
import { Card, CardContent, CardTitle } from "~/components/shared/CustomCard";
import { Button } from "~/components/ui/button";
import { verifyAuth } from "~/lib/supabase.server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import AudienceUploader from "~/components/audience/AudienceUploader";

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;

  if (workspaceId == null) {
    return json(
      {
        success: false,
        error: "Workspace not found",
      },
      { headers },
    );
  }

  const formData = await request.formData();
  const formAction = formData.get("formAction") as string;
  const audienceName = formData.get("audience-name") as string;
  

  if (!audienceName) {
    return json(
      {
        success: false,
        error: "Audience name is required",
      },
      { headers },
    );
  }

  switch (formAction) {
    case "createAudience": {
      // Just create the audience without contacts
      const { data: audienceData, error: audienceError } = await supabaseClient
        .from("audience")
        .insert({
          name: audienceName,
          workspace: workspaceId,
          status: "empty",
        })
        .select()
        .single();

      if (audienceError) {
        return json(
          {
            success: false,
            error: audienceError.message,
          },
          { headers },
        );
      }

      return redirect(`/workspaces/${workspaceId}/audiences/${audienceData.id}`, { headers });
    }
    default:
      break;
  }

  return json({ success: false, error: "Form Action not recognized" }, { headers });
}

export default function AudiencesNew() {
  const actionData = useActionData<typeof action>();
  const params = useParams();
  const workspaceId = params.id;
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(1);
  const [audienceName, setAudienceName] = useState("");
  
  // Get the Supabase client from context
  const { supabase } = useOutletContext<{ supabase: any }>();

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
      <Card bgColor="bg-brand-secondary dark:bg-zinc-900 w-[60vw]">
        <CardTitle>Add an Audience</CardTitle>
        {actionData?.error && (
          <p className="text-center font-Zilla-Slab text-2xl font-bold text-red-500">
            Error: {actionData.error}
          </p>
        )}
        <CardContent>
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
                <label
                  htmlFor="audience-name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Audience Name
                  <input
                    type="text"
                    name="audience-name"
                    id="audience-name"
                    value={audienceName}
                    onChange={(e) => setAudienceName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
                    required
                  />
                </label>
                
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
        </CardContent>
      </Card>
    </section>
  );
}
