export { loader } from "./new.loader.server";
export { action } from "./new.action.server";

import { Form, Link, useActionData, useLoaderData } from "react-router";
import React, { useState } from "react";

import { MdAdd, MdClose } from "react-icons/md";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  BrandedCard,
  BrandedCardActions,
  BrandedCardContent,
  BrandedCardTitle,
} from "@/components/shared/BrandedCard";
import { Text } from "@/components/ui/typography";

export default function NewScript() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const workspace = "workspace" in loaderData ? loaderData.workspace : null;
  const error = "error" in loaderData ? loaderData.error : null;
  const ref = "ref" in loaderData ? loaderData.ref : null;
  const campaignType = "campaignType" in loaderData ? loaderData.campaignType : undefined;
  const [pendingFileName, setPendingFileName] = useState("");

  useActionFeedback(actionData as { error?: unknown } | undefined, {
    getSuccess: () => false,
    getError: (data) => data?.error,
    errorMessage: (data) => {
      const error = (data as { error?: unknown })?.error;
      if (error instanceof Error) return error.message;
      if (typeof error === "string") return error;
      return "An error occurred";
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFileName(file.name);
    } else {
      setPendingFileName("");
    }
  };

  const handleRemoveFile = () => {
    setPendingFileName("");
    const fileInput = document.getElementById("steps") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  if (error || !workspace) {
    return <div>Error: {typeof error === "string" ? error : error?.message || "Workspace not found"}</div>;
  }

  return (
    <section
      id="form"
      className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center"
    >
      {actionData?.error != null ? (
        <Text className="mb-4 text-center text-destructive">
          Error:{" "}
          {actionData.error instanceof Error
            ? actionData.error.message
            : typeof actionData.error === "string"
              ? actionData.error
              : "An error occurred"}
        </Text>
      ) : null}
      <BrandedCard bgColor="bg-brand-secondary dark:bg-card">
        <BrandedCardTitle>Add Script</BrandedCardTitle>
        <BrandedCardContent>
          <Form
            method="POST"
            className="space-y-6"
            encType="multipart/form-data"
          >
            <input hidden value={ref ?? ""} id="ref" name="ref" readOnly />
            <FormField htmlFor="script-name" label="Script Name">
              <Input
                type="text"
                name="script-name"
                id="script-name"
                required
              />
            </FormField>
            <FormField htmlFor="type" label="Script Type">
              <select
                name="type"
                id="type"
                defaultValue={
                  campaignType
                    ? campaignType === "live_call"
                      ? "script"
                      : "ivr"
                    : "script"
                }
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="script">Live Caller Script</option>
                <option value="ivr">Interactive Voice Recording (IVR)</option>
                <option value="inbound_ivr">Inbound IVR Menu</option>
              </select>
            </FormField>
            <div className="block text-sm font-medium text-foreground">
              <div>
                <div className="flex items-baseline gap-4">
                  <div>Upload Steps (Optional JSON file):</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      name="steps"
                      id="steps"
                      accept=".json"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Button asChild variant="outline" size="icon">
                      <label htmlFor="steps" className="cursor-pointer">
                        <MdAdd />
                      </label>
                    </Button>
                  </div>
                </div>
                {pendingFileName && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{pendingFileName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleRemoveFile}
                    >
                      <MdClose />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-sm font-normal italic">
                If no file is uploaded, you can create the script steps later.
              </p>
            </div>

            <BrandedCardActions>
              <Button
                className="rounded-md bg-brand-primary font-Zilla-Slab text-lg font-bold tracking-[1px] text-white transition-colors duration-150 ease-in-out hover:bg-brand-secondary"
                type="submit"
              >
                Save
              </Button>
              <Button asChild variant="outline">
                <Link to=".." relative="path">
                  Back
                </Link>
              </Button>
            </BrandedCardActions>
          </Form>
        </BrandedCardContent>
      </BrandedCard>
    </section>
  );
}
