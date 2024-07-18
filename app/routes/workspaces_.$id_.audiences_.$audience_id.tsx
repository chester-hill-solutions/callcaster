import { LoaderFunctionArgs } from "@remix-run/node";
import { Link, json, useLoaderData } from "@remix-run/react";
import { AudienceTable } from "~/components/AudienceTable";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspace_id = params.id;
  const audience_id = params.audience_id;
  const { data: contacts, error: contactError } = await supabaseClient
    .from("contact_audience")
    .select("...contact(*)")
    .eq("audience_id", audience_id);
  const { data: audience, error: audienceError } = await supabaseClient
    .from("audience")
    .select()
    .eq("id", audience_id)
    .single();
  // console.log("Contacts: ", contacts);
  if (contactError) {
    return json({ contacts: null, error: contactError.message }, { headers });
  }

  return json(
    { contacts, workspace_id, audience, audience_id, error: null },
    { headers },
  );
}

export default function AudienceView() {
  const { contacts, audience, error, workspace_id, audience_id } =
    useLoaderData<typeof loader>();
  //   const actionData = useActionData<typeof action>();
  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {audience?.name || `Unnamed Audience ${audience_id}`}
        </h1>
        <div className="flex gap-1">
          <Button
            asChild
            variant="outline"
            className="border-0 border-black bg-zinc-600 font-Zilla-Slab text-xl font-semibold text-white hover:bg-zinc-300 dark:border-white"
          >
            <Link to=".." relative="path">
              Back
            </Link>
          </Button>
          <Button variant={'destructive'} className="font-Zilla-Slab">
            Delete Audience
          </Button>
        </div>
      </div>
      <AudienceTable
        {...{ contacts, workspace_id, selected_id: audience_id, audience }}
      />
    </main>
  );
}
