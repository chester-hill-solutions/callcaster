import { LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  json,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
} from "@remix-run/react";
import { useEffect } from "react";
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
  const navigate = useNavigate();
  return (
    <main className="flex h-full flex-col gap-4 text-white">
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {audience?.name || `Unnamed Audience ${audience_id}`}
          <span className="font-Sarabun text-xl font-normal text-gray-400">
            | {contacts.length > 0 ? contacts.length : "No"} contacts
          </span>
        </h1>
        <div className="flex gap-1">
          <Form
            method="DELETE"
            action="/api/audiences"
            navigate={false}
            onSubmit={() => navigate("..", { relative: "path" })}
          >
            <input hidden type="hidden" name="id" value={audience_id} />
            <Button
              type="submit"
              variant={"destructive"}
              className="font-Zilla-Slab"
            >
              Delete Audience
            </Button>
          </Form>
        </div>
      </div>
      <AudienceTable
        {...{ contacts, workspace_id, selected_id: audience_id, audience }}
      />
    </main>
  );
}
