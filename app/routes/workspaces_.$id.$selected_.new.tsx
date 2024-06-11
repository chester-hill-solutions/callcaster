import {
  Form,
  Link,
  useActionData,
  useLocation,
  useOutletContext,
} from "@remix-run/react";
import { ActionFunctionArgs, json } from "@remix-run/node";
import { Toaster, toast } from "sonner";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useEffect } from "react";
import {
  handleNewAudience,
  handleNewCampaign,
} from "~/lib/WorkspaceSelectedNewUtils/WorkspaceSelectedNewUtils";
import { capitalize } from "~/lib/utils";

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
    case "newAudience": {
      return handleNewAudience({
        supabaseClient,
        formData,
        workspaceId,
        headers,
      });
    }
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

export default function SelectedNew() {
  const { selectedTable, audiences, campaigns, contacts } = useOutletContext();
  const actionData = useActionData<typeof action>();

  const url = useLocation()
    .pathname.split("/")
    .find(
      (subPath) =>
        subPath === "audiences" ||
        subPath === "campaigns" ||
        subPath === "contacts",
    );

  console.log(url);

  // NEEDS DEBUGGING DUE TO NESTED ROUTING
  // useEffect(() => {
  //   if (actionData && actionData.error == null) {
  //     const selectedCampaignId = actionData.campaignAudienceData.campaign_id;
  //     const selectedCampaignName = campaigns.find(
  //       (campaign) => campaign.id === selectedCampaignId,
  //     ).title;
  //     toast.success(
  //       `Audience ${actionData.audienceData.name} successfully added to Campaign ${selectedCampaignName}`,
  //     );
  //   }
  // }, [actionData]);

  const audiencesNew = (
    <section
      id="form"
      className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-16 pb-10 pt-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
    >
      <h1 className="text-center font-Zilla-Slab text-4xl font-bold">
        Add New Audience
      </h1>
      {actionData?.error != null && (
        <p className="text-center font-Zilla-Slab text-2xl font-bold text-red-500">
          Error: {actionData.error.message}
        </p>
      )}
      <Form method="POST" className="flex flex-col gap-8">
        <input type="hidden" name="formAction" value="newAudience" />
        <label
          htmlFor="audience-name"
          className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
        >
          Audience Name
          <input
            type="text"
            name="audience-name"
            id="audience-name"
            className="w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white"
          />
        </label>
        <div className="flex items-center gap-4 font-Zilla-Slab text-xl font-bold">
          <p className="w-full">Add to Campaign:</p>
          <Select name="campaign-select">
            <SelectTrigger className="w-full border-2 border-black bg-white font-Zilla-Slab text-xl font-semibold dark:border-white dark:bg-transparent">
              <SelectValue placeholder="Campaign" />
            </SelectTrigger>
            <SelectContent className="bg-brand-secondary font-semibold dark:bg-zinc-800">
              {campaigns.map((campaign, i) => (
                <SelectItem
                  key={campaign.id}
                  value={campaign.id}
                  className="text-black active:text-white dark:text-white"
                >
                  {campaign.title ?? `Unnamed campaign ${i + 1}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          <Button
            className="h-fit min-h-[48px] rounded-md bg-brand-primary px-8 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
            transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
            type="submit"
          >
            Add Audience
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

  const campaignsNew = (
    <section
      id="form"
      className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-16 pb-10 pt-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
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

  return (
    <div className="flex h-full w-full items-start justify-center p-16">
      {url === "audiences" && audiencesNew}
      {url === "campaigns" && campaignsNew}
      {url === "contacts" && (
        <p className="w-full text-center font-Zilla-Slab text-3xl opacity-85">
          Adding New {capitalize(url)} coming soon...
        </p>
      )}
    </div>
  );
}
