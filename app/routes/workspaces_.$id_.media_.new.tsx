import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { useEffect } from "react";
import { FaPlus } from "react-icons/fa";
import { Toaster, toast } from "sonner";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

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
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      { success: false, error: "Workspace does not exist" },
      { headers },
    );
  }

  // console.log("XXXXXXXXXXXXXXXXXXXX");
  // console.log("HERE");
  // const formData = await unstable_parseMultipartFormData(
  //   request,
  //   uploadHandler,
  // );

  const formData = await request.formData();
  const mediaName = formData.get("media-name") as string;
  const mediaToUpload = formData.get("media");

  console.log("Media To Upload: ", mediaToUpload);

  const { data: uploadData, error: uploadError } = await supabaseClient.storage
    .from("workspaceAudio")
    .upload(`${workspaceId}/${mediaName}.mp3`, mediaToUpload, {
      cacheControl: "60",
      upsert: false,
      contentType: "audio/mpeg",
    });

  if (uploadError) {
    return json({ success: false, error: uploadError }, { headers });
  }

  return json({ success: true, error: null }, { headers });
}

export default function Media() {
  const { workspace } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const navigate = useNavigate();

  useEffect(() => {
    if (actionData?.success) {
      toast.success("Media successfully uploaded to your workspace!");
    }
  }, [actionData]);

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col items-center gap-4 rounded-sm text-black dark:text-white">
      <section
        id="form"
        className="flex w-fit flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-16 pb-10 pt-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
      >
        <h1 className="flex items-center gap-2 text-center font-Zilla-Slab text-4xl font-bold">
          Add Media to{" "}
          <span className="rounded-md bg-gray-400 bg-opacity-30 px-4 py-2 font-Zilla-Slab text-xl">
            {workspace.name}
          </span>
        </h1>
        {actionData?.error != null && (
          <p className="text-center font-Zilla-Slab text-2xl font-bold text-red-500">
            Error: {actionData.error.message}
          </p>
        )}
        <Form
          method="POST"
          className="flex flex-col gap-8"
          encType="multipart/form-data"
        >
          <label
            htmlFor="media-name"
            className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
          >
            Media Name
            <input
              type="text"
              name="media-name"
              id="media-name"
              className="w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white"
            />
          </label>
          <label
            htmlFor="media"
            className="flex w-full cursor-pointer flex-col gap-2 font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
          >
            Upload:
            <div className="flex w-full items-center justify-center rounded-xl border-2 border-black py-8 transition-colors duration-150 ease-in-out hover:bg-zinc-800 dark:border-white">
              <FaPlus size={"64px"} />
              <input type="file" name="media" id="media" className="hidden" />
            </div>
          </label>

          <div className="flex items-center gap-4">
            <Button
              className="h-fit min-h-[48px] rounded-md bg-brand-primary px-8 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
            transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
              type="submit"
            >
              Upload Media
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-fit border-0 border-black bg-zinc-600 font-Zilla-Slab text-3xl font-semibold text-white dark:border-white"
            >
              <Link to=".." relative="path">
                Back
              </Link>
            </Button>
          </div>
        </Form>
      </section>

      <Toaster richColors />
    </main>
  );
}
