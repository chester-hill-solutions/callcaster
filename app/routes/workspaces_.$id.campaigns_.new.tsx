import { ActionFunctionArgs, json } from "@remix-run/node";
import { Form, Link, useActionData, useOutletContext } from "@remix-run/react";
import { CardAction } from "twilio/lib/rest/content/v1/content";
import {
  Card,
  CardActions,
  CardContent,
  CardTitle,
} from "~/components/CustomCard";
import { Button } from "~/components/ui/button";
import { verifyAuth } from "~/lib/supabase.server";
import { Flags } from "~/lib/types";

import { handleNewCampaign } from "~/lib/WorkspaceSelectedNewUtils/WorkspaceSelectedNewUtils";

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;

  if (workspaceId == null) {
    return json(
      {
        audienceData: null,
        campaignAudienceData: null,
        error: "Workspace not found",
      },
      { headers },
    );
  }

  const formData = await request.formData();
  const formAction = formData.get("formAction") as string;

  switch (formAction) {
    case "newCampaign": {
      return handleNewCampaign({
        supabaseClient,
        formData,
        workspaceId,
        headers,
      });
    }
    default:
      break;
  }

  return json({ error: "Form Action not recognized" }, { headers });
}

export default function CampaignsNew() {
  const { flags }:{flags:Flags} = useOutletContext();
  const isLiveCallEnabled = true //flags?.call?.campaign === true;
  const isMessageEnabled = true //flags?.sms?.campaign === true;
  const isRobocallEnabled = true //flags?.ivr?.campaign === true;

  const actionData = useActionData<typeof action>();
  return (
    <section
      id="form"
      className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center"
    >
      {actionData?.error != null && (
        <p className="absolute bottom-4 text-center font-Zilla-Slab text-2xl font-bold text-red-500">
          Error: {actionData.error.message}
        </p>
      )}
      <Card bgColor="bg-brand-secondary dark:bg-zinc-900">
        <CardTitle>Add Campaign</CardTitle>
        <Form method="POST" className="space-y-6">
          <CardContent>
            <input type="hidden" name="formAction" value="newCampaign" />
            <label
              htmlFor="campaign-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Campaign Name
              <input
                type="text"
                name="campaign-name"
                id="campaign-name"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
              />
            </label>
            <label
              htmlFor="campaign-type"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Campaign Type
              <select
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
                name="campaign-type"
                id="campaign-type"
                required
                
              >
                {isLiveCallEnabled && (
                  <option value="live_call" className="dark:bg-black">
                    Live Call
                  </option>
                )}
                {isMessageEnabled && (
                  <option value="message" className="dark:bg-black">
                    Message
                  </option>
                )}
                {isRobocallEnabled && (
                  <option value="robocall" className="dark:bg-black">
                    Interactive Voice Recording
                  </option>
                )}
              </select>
            </label>
          </CardContent>
          <CardActions>
            <div className="flex items-center gap-4">
              <Button
                size="lg"
                className="w-full bg-brand-primary font-Zilla-Slab text-white hover:bg-brand-secondary"
                type="submit"
              >
                Add Campaign
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full rounded-md bg-gray-200 px-4 py-2 text-center font-Zilla-Slab font-bold text-gray-700 transition duration-150 ease-in-out hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
              >
                <Link to=".." relative="path">
                  Back
                </Link>
              </Button>
            </div>
          </CardActions>
        </Form>
      </Card>
    </section>
  );
}
