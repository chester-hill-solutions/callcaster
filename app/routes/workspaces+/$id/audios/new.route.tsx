import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  json,
  useActionData,
  useNavigate,
  useNavigation,
} from "@remix-run/react";
import { useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { toast } from "sonner";
import { Card, CardActions, CardContent, CardTitle } from "@/components/shared/CustomCard";
import { Button } from "@/components/ui/button";
import {
  AudioUploadError,
  getAudioUploadAcceptValue,
  getSafeMediaBaseName,
  normalizeUploadedAudio,
} from "@/lib/audio.server";
import { verifyAuth } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      { workspace: null, error: "Workspace does not exist" },
      { headers },
    );
  }

  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();
  if (workspaceError) {
    return json({ workspace: null, error: workspaceError }, { headers });
  }

  return json({ workspace: workspaceData, error: null }, { headers });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      { success: false, error: "Workspace does not exist" },
      { headers },
    );
  }
  const formData = await request.formData();
  const mediaName = formData.get("media-name") as string;
  const mediaToUpload = formData.get("media");

  logger.debug("Media To Upload:", mediaToUpload);

  try {
    if (!(mediaToUpload instanceof File)) {
      throw new AudioUploadError("Please choose an audio file to upload.");
    }

    const safeMediaName = getSafeMediaBaseName(mediaName);
    const normalizedAudio = await normalizeUploadedAudio(mediaToUpload);
    const { error: uploadError } = await supabaseClient.storage
      .from("workspaceAudio")
      .upload(
        `${workspaceId}/${safeMediaName}.${normalizedAudio.extension}`,
        normalizedAudio.buffer,
        {
          cacheControl: "60",
          upsert: false,
          contentType: normalizedAudio.contentType,
        },
      );

    if (uploadError) {
      return json({ success: false, error: uploadError }, { headers });
    }

    return json({ success: true, error: null }, { headers });
  } catch (error) {
    logger.error("Workspace audio upload failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to upload audio.";
    const status = error instanceof AudioUploadError ? error.status : 500;
    return json({ success: false, error: message }, { headers, status });
  }
}

export default function Media() {
  const actionData = useActionData<typeof action>();
  const [pendingFileName, setPendingFileName] = useState("");
  const navigate = useNavigate();
  const {state} = useNavigation();

  useEffect(() => {
    if (actionData?.success) {
      toast.success("Media successfully uploaded to your workspace!");
      setTimeout(() => navigate("../", { relative: "path" }), 750);
    }
  }, [actionData]);

  const displayFileToUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filePath = e.target.value;
    setPendingFileName(filePath.split("\\").at(-1) ?? "");
  };

  return (
      <section
        id="form"
        className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center"
        >
      <Card bgColor="bg-brand-secondary dark:bg-zinc-900">
      <CardTitle>Add Audio</CardTitle>
      {actionData?.error != null && (
            <p className="text-center font-Zilla-Slab text-2xl font-bold text-red-500">
              Error: {typeof actionData.error === "string" ? actionData.error : actionData.error.message}
            </p>
          )}
          <CardContent>
            <Form
              method="POST"
              className="space-y-6"
              encType="multipart/form-data"
            >
              <label
                htmlFor="media-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                Audio Name
                <input
                  type="text"
                  name="media-name"
                  id="media-name"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
                  />
              </label>
              <label
                htmlFor="media"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                Upload:
                <div className="flex w-full items-center justify-center rounded-xl border-2 border-black py-8 transition-colors duration-150 ease-in-out hover:bg-zinc-800 dark:border-white">
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
              </label>

              <CardActions>
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
                </CardActions>
            </Form>
          </CardContent>
        </Card>
      </section>
  );
}
