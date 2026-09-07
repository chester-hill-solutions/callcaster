export { loader } from "./new.loader.server";
export { action } from "./new.action.server";

import { Form, useActionData, useLoaderData } from "react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Section } from "@/components/shared/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";

export default function NewAudience() {
  useLoaderData();
  const actionData = useActionData<{ error?: unknown }>();
  const [pendingFileName, setPendingFileName] = useState("");

  const displayFileToUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filePath = e.target.value;
    setPendingFileName(filePath.split("\\").at(-1) || "");
  };

  const handleRemoveFile = () => {
    setPendingFileName("");
    const fileInput = document.getElementById("contacts") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  return (
    <section id="form">
      <PageShell title="Add a Call list" maxWidth="narrow">
        {actionData?.error != null ? (
          <Alert variant="destructive">
            <AlertDescription>Error: {String(actionData.error)}</AlertDescription>
          </Alert>
        ) : null}
        <Section variant="flat" className="space-y-6">
          <Form
            method="POST"
            className="space-y-6"
            encType="multipart/form-data"
          >
            <input type="hidden" name="formAction" value="newAudience" />
            <FormField htmlFor="audience-name" label="Call list name">
              <Input type="text" name="audience-name" id="audience-name" />
            </FormField>
            <div className="block text-sm font-medium text-foreground">
              <div>
                <div className="flex items-baseline gap-4">
                  <div>Upload contacts (Optional .csv file):</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      name="contacts"
                      id="contacts"
                      accept=".csv"
                      className="hidden"
                      onChange={displayFileToUpload}
                    />
                    <Button asChild variant="outline" size="icon" aria-label="Choose a CSV file to upload">
                      <label htmlFor="contacts" className="cursor-pointer">
                        <Plus className="h-4 w-4" />
                      </label>
                    </Button>
                  </div>
                </div>
                {pendingFileName ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{pendingFileName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove selected file"
                      onClick={handleRemoveFile}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <p className="text-sm font-normal italic text-muted-foreground">
                If no file is uploaded, you can add contacts later.
              </p>
              <p className="text-sm font-normal italic text-muted-foreground">
                Preferred format
              </p>
            </div>

            <Button type="submit">Add Call list</Button>
          </Form>
        </Section>
      </PageShell>
    </section>
  );
}
