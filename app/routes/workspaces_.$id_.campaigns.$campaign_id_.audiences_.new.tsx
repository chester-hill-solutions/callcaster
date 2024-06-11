import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  json,
  useActionData,
  useLoaderData,
} from "@remix-run/react";
import { useEffect } from "react";
import { Toaster, toast } from "sonner";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

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

  if (workspaceId == null || campaignId == null) {
    return json(
      {
        audienceData: null,
        campaignAudienceData: null,
        error:
          workspaceId == null ? "Workspace not found" : "Campaign not found",
      },
      { headers },
    );
  }

  const fromData = await request.formData();

  const newAudienceName = fromData.get("audience-name") as string;

  const { data: createAudienceData, error: createAudienceError } =
    await supabaseClient
      .from("audience")
      .insert({
        name: newAudienceName,
        workspace: workspaceId,
      })
      .select()
      .single();

  if (createAudienceError) {
    return json(
      {
        audienceData: null,
        campaignAudienceData: null,
        error: createAudienceError,
      },
      { headers },
    );
  }

  const {
    data: createCampaignAudienceData,
    error: createCampaignAudienceError,
  } = await supabaseClient.from("campaign_audience").insert({
    campaign_id: campaignId,
    audience_id: createAudienceData.id,
  });

  if (createCampaignAudienceError) {
    console.log("Failed to create row on campaign_audience");
    const { data: deleteNewAudience, error: deleteNewAudienceError } =
      await supabaseClient
        .from("audience")
        .delete()
        .eq("id", createAudienceData.id);

    if (deleteNewAudienceError != null) {
      console.log(
        `Deleted New Audience, ${createAudienceData.id}: ${createAudienceData.name}`,
      );
    }

    return json(
      {
        audienceData: null,
        campaignAudienceData: null,
        error: createCampaignAudienceError,
      },
      { headers },
    );
  }

  return json(
    {
      audienceData: createAudienceData,
      campaignAudienceData: createCampaignAudienceData,
      error: null,
    },
    { headers },
  );
}

export default function NewAudience() {
  const { campaign, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData != null && actionData.error == null) {
      toast.success(
        `Audience ${actionData.audienceData.name} successfully added to ${campaign.title}`,
      );
    }
  }, [actionData]);

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] justify-center rounded-sm text-black dark:text-white">
      <section
        id="form"
        className="flex w-fit flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-16 pb-10 pt-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
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
          <div className="font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white">
            Campaign:{" "}
            <span className="rounded-md bg-gray-400 bg-opacity-30 px-4 py-2 font-Zilla-Slab text-xl">
              {campaign.title}
            </span>
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
      <Toaster richColors />
    </main>
  );
}
