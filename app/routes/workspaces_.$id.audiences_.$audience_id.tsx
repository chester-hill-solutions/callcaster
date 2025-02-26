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
  useOutletContext,
} from "@remix-run/react";
import { useEffect, useState } from "react";
import { AudienceTable } from "~/components/AudienceTable";
import AudienceUploadHistory from "~/components/AudienceUploadHistory";
import AudienceUploader from "~/components/AudienceUploader";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
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
  sorting: {
    sortKey: string;
    sortDirection: 'asc' | 'desc';
  };
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") || "50", 10);
  const sortKey = url.searchParams.get("sortKey") || "id";
  const sortDirection = url.searchParams.get("sortDirection") === "desc" ? "desc" : "asc";
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
        },
        sorting: {
          sortKey,
          sortDirection
        }
      },
      { headers }
    );
  }

  // Build a simpler query that should work with sorting
  let query = supabaseClient
    .from("contact_audience")
    .select("...contact!inner(*)", { count: 'exact' })
    .eq("audience_id", parseInt(audience_id));
  
  if (sortKey) {
    query = query.order(`contact(${sortKey})`, { ascending: sortDirection === 'asc' });
  }
  
  // Apply pagination
  const { data: contacts, error: contactError, count } = await query.range(from, to);
  
  
   console.log(contacts, contactError, count);

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
      },
      sorting: {
        sortKey,
        sortDirection
      }
    }, { headers });
  }

  return json<LoaderData>(
    {
      contacts: contacts?.map(contact => ({ contact })) || null,
      workspace_id,
      audience,
      audience_id,
      error: null,
      pagination: {
        currentPage: page,
        pageSize,
        totalCount: count
      },
      sorting: {
        sortKey,
        sortDirection
      }
    },
    { headers },
  );
}

export default function AudienceView() {
  const { contacts, audience, error, workspace_id, audience_id, pagination, sorting } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { supabase } = useOutletContext<{ supabase: any }>();
  const [activeTab, setActiveTab] = useState("contacts");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadComplete = () => {
    // Refresh the contacts list
    setRefreshTrigger(prev => prev + 1);
    // Switch to contacts tab
    setActiveTab("contacts");
  };

  // Refresh the page when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      navigate(".", { replace: true });
    }
  }, [refreshTrigger, navigate]);

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="upload">Upload Contacts</TabsTrigger>
          <TabsTrigger value="history">Upload History</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts">
          <AudienceTable
            {...{
              contacts,
              workspace_id,
              selected_id: audience_id,
              audience,
              pagination,
              sorting
            }}
          />
        </TabsContent>

        <TabsContent value="upload">
          <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg shadow">
            <h2 className="font-Zilla-Slab text-xl font-semibold mb-4 text-brand-primary dark:text-white">
              Upload Contacts to {audience?.name}
            </h2>
            <AudienceUploader
              existingAudienceId={audience_id}
              supabase={supabase}
              onUploadComplete={handleUploadComplete}
            />
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg shadow">
            <h2 className="font-Zilla-Slab text-xl font-semibold mb-4 text-brand-primary dark:text-white">
              Upload History
            </h2>
            <AudienceUploadHistory audienceId={Number(audience_id)} />
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
