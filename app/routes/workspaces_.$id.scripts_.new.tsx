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
import { Button } from "@/components/ui/button";
import { verifyAuth } from "@/lib/supabase.server";
import { CardContent } from "@/components/ui/card";
import { Card, CardActions, CardTitle } from "@/components/shared/CustomCard";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  const url = new URL(request.url);
  const search = new URLSearchParams(url.search);
  const ref = search.get("ref") || null;
  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      { workspace: null, error: "Workspace does not exist" },
      { headers },
    );
  }
  let campaignType;
  if (ref) {
    const { data: campaign } = await supabaseClient
      .from("campaign")
      .select("type")
      .eq("id", Number(ref) || 0)
      .eq("workspace", workspaceId)
      .single();
    campaignType = campaign?.type;
  }
  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();
  if (workspaceError) {
    return json({ workspace: null, error: workspaceError }, { headers });
  }

  return json(
    { workspace: workspaceData, error: null, ref: ref || null, campaignType },
    { headers },
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      { success: false, error: "Workspace does not exist" },
      { headers },
    );
  }

  const formData = await request.formData();
  const nameValue = formData.get("script-name");
  const typeValue = formData.get("type");
  const stepsFileValue = formData.get("steps");
  const refValue = formData.get("ref");

  if (!nameValue || typeof nameValue !== "string") {
    return json(
      { success: false, error: "Script name is required" },
      { headers },
    );
  }

  const name = nameValue;
  const type = typeof typeValue === "string" ? typeValue : "ivr";
  const ref = typeof refValue === "string" ? refValue : null;

  let steps: Record<string, unknown> = {};
  if (stepsFileValue instanceof File && stepsFileValue.size > 0) {
    try {
      const stepsContent = await stepsFileValue.text();
      steps = JSON.parse(stepsContent) as Record<string, unknown>;
    } catch (error) {
      return json(
        { success: false, error: "Invalid JSON file for steps" },
        { headers },
      );
    }
  } else {
    steps = { pages: {}, blocks: {} };
  }
  const { data, error } = await supabaseClient
    .from("script")
    .insert({
      name,
      type,
      steps,
      created_by: user?.id,
      workspace: workspaceId,
    })
    .select();
  if (ref && data && data.length > 0) {
    const tableKey = type === "script" ? "live_campaign" : "ivr_campaign";
    const { error: updateError } = await supabaseClient
      .from(tableKey)
      .update({ script_id: data[0].id })
      .eq("campaign_id", Number(ref) || 0)
      .select();
    if (updateError) {
      return json(
        { success: false, error: updateError },
        { headers },
      );
    }
  }

  if (error) {
    return json({ success: false, error: error }, { headers });
  }

  if (!data || data.length === 0) {
    return json(
      { success: false, error: "Failed to create script" },
      { headers },
    );
  }

  return json({ data, success: true, error: null }, { headers });
}

export default function NewScript() {
  const { workspace, error, ref, campaignType } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [pendingFileName, setPendingFileName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (actionData?.success && actionData.data && actionData.data.length > 0) {
      toast.success("Script successfully added to your workspace!");
      setTimeout(
        () => navigate(`../${actionData.data[0].id}`, { relative: "path" }),
        750,
      );
    } else if (actionData?.error) {
      const errorMessage =
        actionData.error instanceof Error
          ? actionData.error.message
          : typeof actionData.error === "string"
            ? actionData.error
            : "An error occurred";
      toast.error(`Error: ${errorMessage}`);
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
    <section
      id="form"
      className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center"
    >
      {actionData?.error != null && (
        <p className="absolute bottom-4 text-center font-Zilla-Slab text-2xl font-bold text-red-500">
          Error:{" "}
          {actionData.error instanceof Error
            ? actionData.error.message
            : typeof actionData.error === "string"
              ? actionData.error
              : "An error occurred"}
        </p>
      )}
      <Card bgColor="bg-brand-secondary dark:bg-zinc-900">
        <CardTitle>Add Script</CardTitle>
        <CardContent>
          <Form
            method="POST"
            className="space-y-6"
            encType="multipart/form-data"
          >
            <input hidden value={ref} id="ref" name="ref" />
            <label
              htmlFor="script-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Script Name
              <input
                type="text"
                name="script-name"
                id="script-name"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
              />
            </label>
            <label
              htmlFor="type"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Script Type
              <select
                name="type"
                id="type"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
                defaultValue={campaignType ? campaignType === "live_call" ? "script" : "ivr" : "script"}
              >
                <option value="script">Live Caller Script</option>
                <option value="ivr">Interactive Voice Recording (IVR)</option>
              </select>
            </label>
            <div className="block text-sm font-medium text-gray-700 dark:text-gray-200">
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

            <CardActions>
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
            </CardActions>
          </Form>
        </CardContent>
      </Card>
      <Toaster richColors />
    </section>
  );
}
