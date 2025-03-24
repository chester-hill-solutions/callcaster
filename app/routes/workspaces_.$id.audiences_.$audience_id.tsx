import { LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  json,
  useLoaderData,
  useNavigate,
  useOutletContext,
  useRevalidator
} from "@remix-run/react";
import { useEffect, useState } from "react";
import { AudienceTable } from "~/components/AudienceTable";
import AudienceUploadHistory from "~/components/AudienceUploadHistory";
import AudienceUploader from "~/components/AudienceUploader";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { verifyAuth } from "~/lib/supabase.server";
import { Database } from "~/lib/database.types";
import { useInterval } from "~/hooks/useInterval";

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
  latestUpload?: {
    id: number;
    status: string;
    progress: number;
    total_contacts: number;
    processed_contacts: number;
    error_message?: string | null;
  } | null;
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
  
  const { data: contacts, error: contactError, count } = await query.range(from, to);

  const { data: audience, error: audienceError } = await supabaseClient
    .from("audience")
    .select()
    .eq("id", parseInt(audience_id))
    .single();

  // Get the latest upload for this audience
  const { data: latestUpload } = await supabaseClient
    .from("audience_upload")
    .select("*")
    .eq("audience_id", parseInt(audience_id))
    .order("created_at", { ascending: false })
    .limit(1)
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
      },
      latestUpload: null
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
      },
      latestUpload: latestUpload ? {
        id: latestUpload.id,
        status: latestUpload.status,
        progress: latestUpload.processed_contacts && latestUpload.total_contacts 
          ? Math.round((latestUpload.processed_contacts / latestUpload.total_contacts) * 100)
          : 0,
        total_contacts: latestUpload.total_contacts || 0,
        processed_contacts: latestUpload.processed_contacts || 0,
        error_message: latestUpload.error_message
      } : null
    },
    { headers },
  );
}

export default function AudienceView() {
  const { contacts, audience, error, workspace_id, audience_id, pagination, sorting, latestUpload } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { supabase } = useOutletContext<{ supabase: any }>();
  const [activeTab, setActiveTab] = useState("contacts");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const revalidator = useRevalidator();

  // Track current upload status
  const [currentUploadId, setCurrentUploadId] = useState<number | null>(
    latestUpload?.status === "processing" ? latestUpload.id : null
  );

  // Poll for status updates if there's an active upload
  useInterval(
    async () => {
      if (!currentUploadId || !workspace_id) return;

      try {
        const response = await fetch(
          `/api/audience-upload-status?uploadId=${currentUploadId}&workspaceId=${workspace_id}`
        );
        const data = await response.json();

        if (data.error || data.status === "completed" || data.status === "error") {
          setCurrentUploadId(null);
          revalidator.revalidate();
        }
      } catch (error) {
        console.error("Error polling status:", error);
        setCurrentUploadId(null);
      }
    },
    currentUploadId ? 2000 : null
  );

  const handleUploadComplete = (uploadId: string) => {
    setCurrentUploadId(null);
    setRefreshTrigger(prev => prev + 1);
    setActiveTab("contacts");
  };

  useEffect(() => {
    if (refreshTrigger > 0) {
      revalidator.revalidate();
    }
  }, [refreshTrigger, revalidator]);

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
          <TabsTrigger value="contacts">
            Contacts
            {latestUpload?.status === "processing" && (
              <span className="ml-2 text-xs text-blue-500">
                Processing... ({latestUpload.processed_contacts}/{latestUpload.total_contacts})
              </span>
            )}
          </TabsTrigger>
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
