import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  json,
  useActionData,
  useLoaderData,
} from "@remix-run/react";
import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Card, CardContent, CardTitle } from "~/components/CustomCard";
import { handleNewAudience } from "~/lib/WorkspaceSelectedNewUtils/WorkspaceSelectedNewUtils";
import { MdAdd, MdClose } from "react-icons/md";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const campaignId = params.campaign_id;

  if (workspaceId == null || campaignId == null) {
    return json(
      {
        campaign: null,
        error:
          workspaceId == null ? "Workspace not found" : "Campaign not found",
      },
      { headers },
    );
  }

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .select()
    .eq("id", campaignId)
    .eq("workspace", workspaceId)
    .single();

  if (campaignError) {
    return json({ campaign: null, error: campaignError }, { headers });
  }

  return json({ campaign: campaignData, error: null }, { headers });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const campaignId = params.campaign_id;

  if (!(workspaceId && campaignId)) {
    return json(
      {
        audienceData: null,
        campaignAudienceData: null,
        error: !workspaceId ? "Workspace not found" : "Campaign not found",
      },
      { headers },
    );
  }

  const formData = await request.formData();
  const formAction = formData.get("formAction") as string;
  const contactsFile = formData.get("contacts") as File;

  if (!formData.get("audience-name")) {
    return json(
      {
        success: false,
        error: "Audience name is required",
      },
      { headers },
    );
  }
  switch (formAction) {
    case "newAudience": {
      return handleNewAudience({
        supabaseClient,
        formData,
        workspaceId,
        headers,
        contactsFile,
        campaignId,
      });
    }
    default:
      break;
  }

  return json({ error: "Form Action not recognized" }, { headers });
}

export default function NewAudience() {
  const { campaign, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [pendingFileName, setPendingFileName] = useState("");

  const displayFileToUpload = (e) => {
    const filePath = e.target.value;
    setPendingFileName(filePath.split("\\").at(-1));
  };

  const handleRemoveFile = () => {
    setPendingFileName("");
    const fileInput = document.getElementById("contacts") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  return (
    <section
      id="form"
      className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center"
    >
      <Card bgColor="bg-brand-secondary dark:bg-zinc-900">
        <CardTitle>Add an Audience</CardTitle>
        {actionData?.error != null && (
          <p className="text-center font-Zilla-Slab text-2xl font-bold text-red-500">
            Error: {actionData.error.message}
          </p>
        )}
        <CardContent>
          <Form
            method="POST"
            className="space-y-6"
            encType="multipart/form-data"
          >
            <input type="hidden" name="formAction" value="newAudience" />
            <label
              htmlFor="audience-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Audience Name
              <input
                type="text"
                name="audience-name"
                id="audience-name"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
              />
            </label>
            <div className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              <div>
                <div className="flex items-baseline gap-4">
                  <div>Upload contacts (Optional .csv file):</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      name="contacts"
                      id="contacts"
                      accept=".csv"
                      className="hidden"
                      onChange={displayFileToUpload}
                    />
                    <Button asChild variant="outline" size="icon">
                      <label htmlFor="contacts" className="cursor-pointer">
                        <MdAdd />
                      </label>
                    </Button>
                  </div>
                </div>
                {pendingFileName && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{pendingFileName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleRemoveFile}
                    >
                      <MdClose />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-sm font-normal italic">
                If no file is uploaded, you can add contacts later.
              </p>
              <p className="text-sm font-normal italic">Preferred format</p>
            </div>

            <div className="flex items-center gap-4">
              <Button
                className="h-fit min-h-[48px] w-full rounded-md bg-brand-primary px-8 py-2 font-Zilla-Slab text-lg font-bold tracking-[1px]
                text-white transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
                type="submit"
              >
                Add Audience
              </Button>{" "}
            </div>
          </Form>
        </CardContent>
      </Card>
    </section>
  );
}
