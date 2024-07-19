import TeamMember, { MemberRole } from "~/components/Workspace/TeamMember";

import { ActionFunctionArgs, redirect } from "@remix-run/node";
import {
  Form,
  json,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useOutletContext,
} from "@remix-run/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  getUserRole,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
  removeWorkspacePhoneNumber,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { useSupabaseRealtime } from "~/hooks/useSupabaseRealtime";
import { toast, Toaster } from "sonner";
import { MdCached, MdCheckCircle, MdClose, MdError } from "react-icons/md";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { NumbersTable } from "~/components/NumbersTable";
import { NumberCallerId } from "~/components/NumberCallerId";
import { NumberPurchase } from "~/components/NumberPurchase";


export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession.user){
    return redirect('/signin')
  }
  const workspaceId = params.id;
  const { data: users, error } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });
  const { data: phoneNumbers, error: numbersError } =
    await getWorkspacePhoneNumbers({ supabaseClient, workspaceId });

  if (serverSession) {
    const userRole = getUserRole({ serverSession, workspaceId });
    const hasAccess = userRole !== MemberRole.Caller;
    if (!hasAccess) return redirect("..");
    return json(
      {
        phoneNumbers,
        workspaceId,
        users
      },
      { headers },
    );
  }

  return json(
    {
      phoneNumbers,
      workspaceId,
      user: serverSession?.user,
      users
    },
    { headers },
  );
};
type ValidationRequest = {
  accountSid: string;
  callSid: string;
  friendlyName: string;
  phoneNumber: string;
  validationCode: string;
};
type NumberCapabilities = {
  fax: boolean;
  mms: boolean;
  sms: boolean;
  voice: boolean;
  verification_status: boolean;
};
type NumberRequest = Array<{
  id: bigint;
  created_at: string;
  workspace: string;
  friendly_name: string;
  phone_number: string;
  capabilities: NumberCapabilities;
}>;
type CallerIDResponse = {
  validationRequest: ValidationRequest;
  numberRequest: NumberRequest;
};

export const action = async ({ request, params }) => {
  const { supabaseClient } = await getSupabaseServerClientWithSession(request);

  const data = Object.fromEntries(await request.formData());
  const formName = data.formName;
  const workspace_id = params.id;
  
  if (formName === "caller-id") {
    delete data.formName;
    const res = await fetch(`${process.env.BASE_URL}/api/caller-id`, {
      body: JSON.stringify({ ...data, workspace_id }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const { validationRequest, numberRequest }: CallerIDResponse =
      await res.json();
    return { validationRequest, numberRequest };
  } else if (formName === "remove-number") {
    delete data.formName;
    const { error } = await removeWorkspacePhoneNumber({
      supabaseClient,
      numberId: data.numberId,
      workspaceId: workspace_id,
    });
    if (error) return { error };
    return null;
  }
  return { error: "An unknown error occured" };
};

export default function WorkspaceSettings() {
  const {
    phoneNumbers: initNumbers,
    workspaceId,
    user,
    users
  } = useLoaderData<typeof loader>();
  const { supabase } = useOutletContext();
  const actionData = useActionData<typeof action>();
  const [isDialogOpen, setDialog] = useState(!!actionData?.data);
  const fetcher = useFetcher("numbers");
  const { phoneNumbers } = useSupabaseRealtime({
    supabase,
    user,
    workspace: workspaceId,
    init: { phoneNumbers: initNumbers, queue:[] },
  });

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (actionData?.validationRequest) {
      setDialog(true);
    }
  }, [actionData]);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setDialog}>
      <DialogContent className="flex w-[450px] flex-col items-center bg-card">
        <DialogHeader>
          <DialogTitle className="text-center font-Zilla-Slab text-4xl text-primary">
            Your verification code
          </DialogTitle>
          <div className="w-[400px]">
            <p className="text-center">
              You will receive a call at{" "}
              {actionData?.validationRequest?.phoneNumber}.
            </p>
            <div className="flex justify-center">
              <div className="my-4 rounded-md border-2 border-secondary bg-slate-50 p-4 text-5xl shadow-lg">
                {actionData?.validationRequest?.validationCode}
              </div>
            </div>
            <p className="text-center">Enter this code when prompted</p>
          </div>
        </DialogHeader>
      </DialogContent>
      <div className="flex flex-col">
        <div className="flex justify-end pr-4 pt-4">
          <Button
            asChild
            variant="outline"
            className="h-full w-fit border-0 border-black bg-zinc-600 font-Zilla-Slab text-2xl font-semibold text-white dark:border-white"
          >
            <Link to=".." relative="path">
              Back
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap">
        <NumbersTable phoneNumbers={phoneNumbers} users={users}/>
          <NumberCallerId />
          <NumberPurchase fetcher={fetcher} workspaceId={workspaceId}/>
        </div>
      </div>
    </Dialog>
  );
}
