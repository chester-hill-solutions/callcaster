export { loader } from "./$audience_id.loader.server";

import { Form, useLoaderData, useNavigate, useOutletContext, useRevalidator } from "react-router";

import { useState } from "react";
import { AudienceTable } from "@/components/audience/AudienceTable";
import AudienceUploadHistory from "@/components/audience/AudienceUploadHistory";
import AudienceUploader from "@/components/audience/AudienceUploader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/typography";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useInterval } from "@/hooks/utils/useInterval";
import { logger } from "@/lib/logger.client";
import { AUDIENCE_UPLOAD_PROCESSING_POLL_MS } from "../../../../../shared/audience-upload";

import type { AudienceDetailLoaderData } from "./$audience_id.types";

export default function AudienceView() {
  const {
    contacts,
    audience,
    error,
    contactsError,
    workspace_id,
    audience_id,
    pagination,
    sorting,
    latestUpload,
  } = useLoaderData<AudienceDetailLoaderData>();
  const navigate = useNavigate();
  useOutletContext<{ }>();
  const [activeTab, setActiveTab] = useState("contacts");
  const revalidator = useRevalidator();
  const [name, setName] = useState(audience?.name ?? "");
  const [prevAudienceName, setPrevAudienceName] = useState(audience?.name ?? "");
  if (prevAudienceName !== (audience?.name ?? "")) {
    setPrevAudienceName(audience?.name ?? "");
    setName(audience?.name ?? "");
  }

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
      } catch (pollError) {
        logger.error("Error polling status:", pollError);
        setCurrentUploadId(null);
      }
    },
    currentUploadId ? AUDIENCE_UPLOAD_PROCESSING_POLL_MS : null
  );

  const handleUploadComplete = (_uploadId: string) => {
    setCurrentUploadId(null);
    revalidator.revalidate();
    setActiveTab("contacts");
  };

  const title =
    name.trim() ||
    (audience_id ? `Unnamed Audience ${audience_id}` : "Unnamed Audience");

  return (
    <main className="flex h-full flex-col gap-4 text-foreground">
      <div className="flex items-center justify-between gap-4">
        <Heading as="h1" level={2} branded={false}>
          {title}
        </Heading>
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

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {contactsError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Contacts could not be loaded. The call list name and settings below are still available.
          </AlertDescription>
        </Alert>
      ) : null}

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
            contacts={contacts}
            workspace_id={workspace_id}
            selected_id={audience_id}
            pagination={pagination}
            sorting={sorting}
            name={name}
            onNameChange={setName}
          />
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <Heading as="h2" level={3} branded={false}>
            Upload Contacts to {title}
          </Heading>
          <AudienceUploader
            existingAudienceId={audience_id}
            onUploadComplete={handleUploadComplete}
          />
        </TabsContent>

        <TabsContent value="history">
          <AudienceUploadHistory
            audienceId={Number(audience_id)}
            workspaceId={workspace_id ?? ""}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
