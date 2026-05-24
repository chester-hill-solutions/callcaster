export { loader } from "./new.loader.server";
export { action } from "./new.action.server";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, Form, Link, useActionData, useNavigate, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { toast } from "sonner";
import { Card, CardActions, CardContent, CardTitle } from "@/components/shared/CustomCard";
import { Button } from "@/components/ui/button";
import { getAudioUploadAcceptValue } from "@/lib/audio-upload";

export default function Media() {
  const actionData = useActionData();
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
