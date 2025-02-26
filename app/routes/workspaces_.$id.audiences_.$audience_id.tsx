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
import AudienceUploadHistory from "~/components/AudienceUploadHistory";
import { Button } from "~/components/ui/button";
import { verifyAuth } from "~/lib/supabase.server";
import { Database } from "~/lib/database.types";

type LoaderData = {
  contacts: Array<{ contact: Database['public']['Tables']['contact']['Row'] }> | null;
  workspace_id: string | undefined;
  audience: Database['public']['Tables']['audience']['Row'] | null;
  audience_id: string | undefined;
  error: string | null;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number | null;
  };
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") || "50", 10);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const workspace_id = params.id;
  const audience_id = params.audience_id;

  if (!audience_id) {
    return json<LoaderData>(
      { 
        contacts: null, 
        workspace_id,
        audience: null,
        audience_id,
        error: "Audience ID is required",
        pagination: {
          currentPage: page,
          pageSize,
          totalCount: null
        }
      },
      { headers }
    );
  }

  const { data: contacts, error: contactError, count } = await supabaseClient
    .from("contact_audience")
    .select("contact(*)", { count: 'exact' })
    .eq("audience_id", parseInt(audience_id))
    .range(from, to);

  const { data: audience, error: audienceError } = await supabaseClient
    .from("audience")
    .select()
    .eq("id", parseInt(audience_id))
    .single();

  if (contactError) {
    return json<LoaderData>({ 
      contacts: null, 
      workspace_id,
      audience: null,
      audience_id,
      error: contactError.message,
      pagination: {
        currentPage: page,
        pageSize,
        totalCount: null
      }
    }, { headers });
  }

  return json<LoaderData>(
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
      
      {/* Upload History Section */}
      <div className="mb-6">
        <h2 className="font-Zilla-Slab text-xl font-semibold mb-2 text-brand-primary dark:text-white">
          Upload History
        </h2>
        <AudienceUploadHistory audienceId={Number(audience_id)} />
      </div>
      
      <AudienceTable
        {...{ contacts, workspace_id, selected_id: audience_id, audience, pagination }}
      />
    </main>
  );
}
