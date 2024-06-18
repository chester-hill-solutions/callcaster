import { ActionFunctionArgs, json } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

import { handleNewCampaign } from "~/lib/WorkspaceSelectedNewUtils/WorkspaceSelectedNewUtils";

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

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
  const actionData = useActionData<typeof action>();
  return (
    <section
      id="form"
      className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-16 pb-10 pt-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
    >
      <h1 className="text-center font-Zilla-Slab text-4xl font-bold">
        Add Campaign
      </h1>
      {actionData?.error != null && (
        <p className="text-center font-Zilla-Slab text-2xl font-bold text-red-500">
          Error: {actionData.error.message}
        </p>
      )}
      <Form method="POST" className="flex flex-col gap-8">
        <input type="hidden" name="formAction" value="newCampaign" />
        <label
          htmlFor="campaign-name"
          className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
        >
          Campaign Name
          <input
            type="text"
            name="campaign-name"
            id="campaign-name"
            className="w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white"
          />
        </label>

        <label
          htmlFor="campaign-type"
          className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
        >
          Campaign Type
          <select
            className="rounded-sm border-2 border-black bg-transparent px-2 py-1 text-xl font-semibold dark:border-white  "
            name="campaign-type"
            id="campaign-type"
            value={'live_call'}
            disabled
          >
            <option value="message" className="dark:bg-black">
              Message
            </option>
            <option value="robocall" className="dark:bg-black">
              Robocall
            </option>
            <option value="simple_ivr" className="dark:bg-black">
              Simple IVR
            </option>
            <option value="complex_ivr" className="dark:bg-black">
              Complex IVR
            </option>
            <option value="live_call" className="dark:bg-black">
              Live Call
            </option>
          </select>
        </label>
        <div className="flex items-center gap-4">
          <Button
            className="h-fit min-h-[48px] rounded-md bg-brand-primary px-8 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
            transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
            type="submit"
          >
            Add Campaign
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-fit border-0 border-black bg-zinc-600 font-Zilla-Slab text-3xl font-semibold text-white hover:bg-zinc-300 dark:border-white"
          >
            <Link to=".." relative="path">
              Back
            </Link>
          </Button>
        </div>
      </Form>
    </section>
  );
}
