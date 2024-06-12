import { LoaderFunctionArgs } from "@remix-run/node";
import {
  Link,
  Outlet,
  json,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { AudienceTable } from "~/components/AudienceTable";
import { mediaColumns } from "~/components/Media/columns";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import {
  audienceColumns,
  contactColumns,
} from "~/components/WorkspaceTable/columns";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspace_id = params.id;
  const audience_id = params.audience_id;
  const { data: contacts, error: contactError } = await supabaseClient
    .from("contact_audience")
    .select("...contact(*), audience(*)")
    .eq("audience_id", audience_id);
  console.log(contacts);
  if (contactError) {
    return json({ contacts: null, error: contactError.message }, { headers });
  }

  return json(
    { contacts, workspace_id, audience: contacts[0]?.audience, error: null },
    { headers },
  );
}

export default function AudienceView() {
  const { contacts, audience, error, workspace_id } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  //   const actionData = useActionData<typeof action>();
  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {audience?.name || `Unnamed Audience ${audience.id}`}
        </h1>
        <div>
          <Button
            asChild
            variant="outline"
            className="border-0 border-black bg-zinc-600 font-Zilla-Slab text-xl font-semibold text-white hover:bg-zinc-300 dark:border-white"
          >
            <Link to=".." relative="path">
              Back
            </Link>
          </Button>
        </div>
      </div>
      {contacts.length && (
        <AudienceTable
          {...{ contacts, workspace_id, selected_id: audience.id, audience }}
        />
      )}
    </main>
  );
}
