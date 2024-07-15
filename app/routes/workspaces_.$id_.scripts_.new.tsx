import React, { useEffect, useState } from "react";
import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";

import { MdAdd, MdClose } from "react-icons/md";
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

  const formData = await request.formData();
  const name = formData.get("script-name");
  const type = formData.get("type") || "ivr";
  const stepsFile = formData.get("steps") as File;

  if (!name) {
    return json({ success: false, error: "Script name is required" }, { headers });
  }

  let steps = {};
  if (stepsFile.size > 0) {
    try {
      const stepsContent = await stepsFile.text();
      steps = JSON.parse(stepsContent);
    } catch (error) {
      return json({ success: false, error: "Invalid JSON file for steps" }, { headers });
    }
  } 
  else {
    steps = {pages:{}, blocks:{}}
  }
  console.log(steps)
  const { error } = await supabaseClient.from("script").insert({
    name,
    type,
    steps,
    created_by: serverSession.user.id,
    workspace: workspaceId,
  });

  if (error) {
    return json({ success: false, error: error }, { headers });
  }

  return json({ success: true, error: null }, { headers });
}

export default function NewScript() {
    const { workspace, error } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const [pendingFileName, setPendingFileName] = useState("");
    const navigate = useNavigate();
  
    useEffect(() => {
      if (actionData?.success) {
        toast.success("Script successfully added to your workspace!");
        setTimeout(() => navigate("../", { relative: "path" }), 750);
      } else if (actionData?.error) {
        toast.error(`Error: ${actionData.error.message || actionData.error}`);
      }
    }, [actionData, navigate]);
  
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
      return <div>Error: {error?.message || "Workspace not found"}</div>;
    }
  
    return (
      <main className="mx-auto mt-8 flex h-full w-[80%] flex-col items-center gap-4 rounded-sm text-black dark:text-white">
        <section
          id="form"
          className="flex w-fit flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-16 pb-10 pt-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
        >
          <h1 className="flex items-center gap-2 text-center font-Zilla-Slab text-4xl font-bold">
            Add Script to{" "}
            <span className="rounded-md bg-gray-400 bg-opacity-30 px-4 py-2 font-Zilla-Slab text-xl">
              {workspace.name}
            </span>
          </h1>
          <Form
            method="POST"
            className="flex flex-col gap-8"
            encType="multipart/form-data"
          >
            <div className="flex flex-col gap-4">
              <label
                htmlFor="script-name"
                className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
              >
                Script Name
                <input
                  type="text"
                  name="script-name"
                  id="script-name"
                  required
                  className="w-full rounded-sm border-2 border-black bg-transparent text-black dark:border-white dark:text-white"
                />
              </label>
              <label
                htmlFor="type"
                className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
              >
                Script Type
                <select
                  name="type"
                  id="type"
                  className="w-full rounded-sm border-2 border-black bg-transparent text-black dark:border-white dark:text-white"
                >
                  <option value="ivr">IVR</option>
                  <option value="script">Script</option>
                </select>
              </label>
              <div className="flex w-full flex-col gap-2 font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white">
                <span>Upload Steps (Optional JSON file):</span>
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
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="rounded-md bg-brand-primary font-Zilla-Slab text-lg font-bold tracking-[1px] text-white
                transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
                type="submit"
              >
                Save
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-0 border-black bg-zinc-600 font-Zilla-Slab text-lg font-semibold text-white dark:border-white"
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
  
  