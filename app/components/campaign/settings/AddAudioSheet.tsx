import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useFetcherOnIdle } from "@/hooks/utils/useFetcherOnIdle";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";

type UploadSuccess = {
  audio: {
    name: string;
    path: string;
    signed_url: string | null;
  };
};

type UploadError = {
  error: string;
};

type UploadResult = UploadSuccess | UploadError;

function isUploadError(data: UploadResult): data is UploadError {
  return "error" in data && typeof data.error === "string";
}

function isUploadSuccess(data: UploadResult): data is UploadSuccess {
  return "audio" in data && data.audio != null && typeof data.audio.name === "string";
}

export function AddAudioSheet({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<UploadResult>();
  const revalidator = useRevalidator();
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingFileName, setPendingFileName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const isSubmitting = fetcher.state !== "idle";

  const resetForm = () => {
    setPendingFileName("");
    setLocalError(null);
    formRef.current?.reset();
  };

  useFetcherOnIdle(fetcher, (data) => {
    if (!data) {
      return;
    }
    if (isUploadError(data)) {
      setLocalError(data.error);
      toast.error(data.error);
      return;
    }
    if (isUploadSuccess(data)) {
      toast.success(`Uploaded ${data.audio.name}`);
      resetForm();
      onOpenChange(false);
      revalidator.revalidate();
    }
  });

  /**
   * @effect Clear form state when the sheet closes so the next open starts blank.
   * @effect-deps open
   * @effect-side-effects local form reset
   * @effect-why-not-loader Sheet open state is client-only UI chrome.
   */
  useEffect(() => {
    if (!open) {
      setPendingFileName("");
      setLocalError(null);
      formRef.current?.reset();
    }
  }, [open]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      setLocalError("Audio name is required.");
      return;
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setLocalError("Please choose an audio file to upload.");
      return;
    }

    formData.set("name", name);
    fetcher.submit(formData, {
      method: "POST",
      action: `/api/workspaces/${workspaceId}/audios`,
      encType: "multipart/form-data",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add audio</SheetTitle>
          <SheetDescription>
            Upload a file to this workspace library, then select it for voicemail
            or live voice drop.
          </SheetDescription>
        </SheetHeader>
        <form
          ref={formRef}
          className="mt-6 space-y-6"
          onSubmit={handleSubmit}
          encType="multipart/form-data"
        >
          <FormField htmlFor="add-audio-name" label="Audio name" required>
            <Input
              id="add-audio-name"
              name="name"
              type="text"
              autoComplete="off"
              disabled={isSubmitting}
            />
          </FormField>
          <FormField htmlFor="add-audio-file" label="Upload" required>
            <label
              htmlFor="add-audio-file"
              className="flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-border py-8 transition-colors duration-150 ease-in-out hover:bg-muted"
            >
              {pendingFileName === "" ? (
                <Plus className="h-6 w-6 text-muted-foreground" aria-hidden />
              ) : (
                <span className="px-3 text-sm">{pendingFileName}</span>
              )}
              <input
                id="add-audio-file"
                name="file"
                type="file"
                accept={getAudioUploadAcceptValue()}
                className="hidden"
                disabled={isSubmitting}
                onChange={(event) => {
                  const filePath = event.target.value;
                  setPendingFileName(filePath.split("\\").at(-1) ?? "");
                }}
              />
            </label>
          </FormField>
          {localError ? (
            <p className="text-sm text-destructive" role="alert">
              {localError}
            </p>
          ) : null}
          <SheetFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Uploading…" : "Upload audio"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
