import { ActionFunctionArgs, json } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

import { handleNewAudience } from "~/lib/WorkspaceSelectedNewUtils/WorkspaceSelectedNewUtils";

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
    default:
      break;
  }

  return json({ error: "Form Action not recognized" }, { headers });
}

export default function AudiencesNew() {
  const actionData = useActionData<typeof action>();
  return (
    <main className="mx-auto mt-8 flex h-full w-fit flex-col gap-4 rounded-sm px-8 pb-10 pt-6 dark:text-white">
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
    </main>
  );
}
