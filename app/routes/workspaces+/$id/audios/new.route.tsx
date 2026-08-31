export { loader } from "./new.loader.server";
export { action } from "./new.action.server";

import { Form, Link, useActionData, useNavigation } from "react-router";
import { useRef, useState } from "react";
import { Section } from "@/components/shared/Section";
import { FileDropzone } from "@/components/shared/FileDropzone";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { Text } from "@/components/ui/typography";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";

export default function Media() {
  const actionData = useActionData();
  const [pendingFileName, setPendingFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { state } = useNavigation();

  const displayFileToUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filePath = e.target.value;
    setPendingFileName(filePath.split("\\").at(-1) ?? "");
  };

  const handleFileDrop = (file: File) => {
    // Native <Form> submission reads the input's own FileList, so a dropped
    // file must be written back into it (real browsers all support this;
    // jsdom doesn't, hence the feature check).
    if (fileInputRef.current && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInputRef.current.files = transfer.files;
    }
    setPendingFileName(file.name);
  };

  return (
    <section id="form">
      <PageShell title="Add Audio" maxWidth="narrow">
        {actionData?.error != null ? (
          <Text className="text-center text-destructive">
            Error:{" "}
            {typeof actionData.error === "string"
              ? actionData.error
              : actionData.error.message}
          </Text>
        ) : null}
        <Form method="POST" className="space-y-6" encType="multipart/form-data">
          <Section variant="flat" className="space-y-6">
            <FormField htmlFor="media-name" label="Audio Name">
              <Input type="text" name="media-name" id="media-name" />
            </FormField>
            <FormField htmlFor="media" label="Upload">
              <FileDropzone
                ref={fileInputRef}
                name="media"
                accept={getAudioUploadAcceptValue()}
                ariaLabel="Choose an audio file to upload"
                title="Drop or choose an audio file"
                selectedFileName={pendingFileName || undefined}
                onFileChange={displayFileToUpload}
                onFileDrop={handleFileDrop}
              />
            </FormField>
          </Section>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button asChild variant="outline">
              <Link to=".." relative="path">
                Back
              </Link>
            </Button>
            <Button
              type="submit"
              disabled={state !== "idle"}
              className="bg-brand-primary text-white hover:bg-brand-secondary"
            >
              Upload Audio
            </Button>
          </div>
        </Form>
      </PageShell>
    </section>
  );
}
