export { loader } from "./$audience_id.loader.server";

import { data as routeData, LoaderFunctionArgs, Form, useLoaderData, useNavigate, useOutletContext, useRevalidator } from "react-router";

import { useState } from "react";
import { AudienceTable } from "@/components/audience/AudienceTable";
import AudienceUploadHistory from "@/components/audience/AudienceUploadHistory";
import AudienceUploader from "@/components/audience/AudienceUploader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Database } from "@/lib/database.types";
import { useInterval } from "@/hooks/utils/useInterval";
import { logger } from "@/lib/logger.client";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AudienceDetailLoaderData } from "./$audience_id.types";

export default function AudienceView() {
  const { contacts, audience, error, workspace_id, audience_id, pagination, sorting, latestUpload } =
    useLoaderData<AudienceDetailLoaderData>();
  const navigate = useNavigate();
  const { supabase } = useOutletContext<{ supabase: SupabaseClient<Database> }>();
  const [activeTab, setActiveTab] = useState("contacts");
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
        logger.error("Error polling status:", error);
        setCurrentUploadId(null);
      }
    },
    currentUploadId ? 2000 : null
  );

  const handleUploadComplete = (_uploadId: string) => {
    setCurrentUploadId(null);
    revalidator.revalidate();
    setActiveTab("contacts");
  };

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
