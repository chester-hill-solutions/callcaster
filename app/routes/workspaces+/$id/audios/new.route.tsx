export { loader } from "./new.loader.server";
export { action } from "./new.action.server";

import { Form, Link, useActionData, useNavigation } from "react-router";
import { useState } from "react";
import { FaPlus } from "react-icons/fa";
import {
  BrandedCard,
  BrandedCardActions,
  BrandedCardContent,
  BrandedCardTitle,
} from "@/components/shared/BrandedCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";

export default function Media() {
  const actionData = useActionData();
  const [pendingFileName, setPendingFileName] = useState("");
  const {state} = useNavigation();

  const displayFileToUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filePath = e.target.value;
    setPendingFileName(filePath.split("\\").at(-1) ?? "");
  };

  return (
    <section
      id="form"
      className="mx-auto w-full max-w-2xl px-2 py-6 sm:px-4"
    >
      <BrandedCard className="w-full" bgColor="bg-brand-secondary dark:bg-card">
        <BrandedCardTitle>Add Audio</BrandedCardTitle>
        {actionData?.error != null ? (
          <Text className="text-center text-destructive">
            Error:{" "}
            {typeof actionData.error === "string"
              ? actionData.error
              : actionData.error.message}
          </Text>
        ) : null}
        <BrandedCardContent>
          <Form
            method="POST"
            className="space-y-6"
            encType="multipart/form-data"
          >
            <FormField htmlFor="media-name" label="Audio Name">
              <Input type="text" name="media-name" id="media-name" />
            </FormField>
            <FormField htmlFor="media" label="Upload">
              <div className="flex w-full items-center justify-center rounded-xl border-2 border-border py-8 transition-colors duration-150 ease-in-out hover:bg-muted">
                  {pendingFileName === "" ? (
                    <FaPlus size={"26px"} />
                  ) : (
                    <p>{pendingFileName}</p>
                  )}
                  <input
                    type="file"
                    name="media"
                    id="media"
                    accept={getAudioUploadAcceptValue()}
                    className="hidden"
                    onChange={displayFileToUpload}
                  />
                </div>
            </FormField>

              <BrandedCardActions>
                <Button
                  className="h-fit min-h-[48px] rounded-md bg-brand-primary px-8 py-2 font-Zilla-Slab text-lg font-bold tracking-[1px] text-white
            transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black w-full"
                  type="submit"
                  disabled={state !== "idle"}
                >
                  Upload Audio
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-fit border-0 border-black bg-zinc-600 font-Zilla-Slab text-lg font-semibold text-white dark:border-white"
                >
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
