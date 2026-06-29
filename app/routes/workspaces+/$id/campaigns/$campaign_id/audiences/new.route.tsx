export { loader } from "./new.loader.server";
export { action } from "./new.action.server";

import { Form, useActionData, useLoaderData } from "react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";
import {
  BrandedCard,
  BrandedCardContent,
  BrandedCardTitle,
} from "@/components/shared/BrandedCard";

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
    <section
      id="form"
      className="mx-auto w-full max-w-2xl px-2 py-6 sm:px-4"
    >
      <BrandedCard className="w-full" bgColor="bg-brand-secondary dark:bg-card">
        <BrandedCardTitle>Add an Audience</BrandedCardTitle>
        {actionData?.error != null ? (
          <Text className="text-center text-destructive">
            Error: {String(actionData.error)}
          </Text>
        ) : null}
        <BrandedCardContent>
          <Form
            method="POST"
            className="space-y-6"
            encType="multipart/form-data"
          >
            <input type="hidden" name="formAction" value="newAudience" />
            <FormField htmlFor="audience-name" label="Audience Name">
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
                    <Button asChild variant="outline" size="icon">
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

            <Button
              className="h-fit min-h-[48px] w-full bg-brand-primary font-Zilla-Slab text-lg font-bold tracking-[1px] text-white hover:bg-brand-secondary"
              type="submit"
            >
              Add Audience
            </Button>
          </Form>
        </BrandedCardContent>
      </BrandedCard>
    </section>
  );
}
