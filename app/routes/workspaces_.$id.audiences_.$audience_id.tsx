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

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") || "50", 10);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const workspace_id = params.id;
  const audience_id = params.audience_id;

    const { data: contacts, error: contactError, count } = await supabaseClient
    .from("contact_audience")
    .select("...contact(*)", { count: 'exact' })
    .eq("audience_id", audience_id)
    .range(from, to);

  const { data: audience, error: audienceError } = await supabaseClient
    .from("audience")
    .select()
    .eq("id", audience_id)
    .single();

  if (contactError) {
    return json({ contacts: null, error: contactError.message }, { headers });
  }

  return json(
    { 
      contacts, 
      workspace_id, 
      audience, 
      audience_id, 
      error: null,
      pagination: {
        currentPage: page,
        pageSize,
        totalCount: count
      }
    },
    { headers },
  );
}

export default function AudienceView() {
  const { contacts, audience, error, workspace_id, audience_id, pagination } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <main className="flex h-full flex-col gap-4 text-white">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {audience?.name || `Unnamed Audience ${audience_id}`}
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
        {...{ contacts, workspace_id, selected_id: audience_id, audience, pagination }}
      />
    </main>
  );
}
