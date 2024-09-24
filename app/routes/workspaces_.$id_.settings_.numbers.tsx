import TeamMember, { MemberRole } from "~/components/Workspace/TeamMember";

import { ActionFunctionArgs, LoaderFunctionArgs, redirect, TypedResponse } from "@remix-run/node";
import {
  Form,
  json,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useOutletContext,
} from "@remix-run/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  getUserRole,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
  removeWorkspacePhoneNumber,
  updateCallerId,
  updateWorkspacePhoneNumber,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { useSupabaseRealtime } from "~/hooks/useSupabaseRealtime";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { NumbersTable } from "~/components/NumbersTable";
import { NumberCallerId } from "~/components/NumberCallerId";
import { NumberPurchase } from "~/components/NumberPurchase";
import { User, WorkspaceNumbers } from "~/lib/types";

type LoaderData = {
  phoneNumbers: WorkspaceNumbers;
  workspaceId: string;
  mediaNames: string[];
  users: User[];
};

export const loader = async ({ request, params }:LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession.user) {
    return redirect("/signin");
  }
  const workspaceId = params.id;
  const { data: users, error } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });
  const { data: phoneNumbers, error: numbersError }=
    await getWorkspacePhoneNumbers({ supabaseClient, workspaceId });
  const { data: mediaNames } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspaceId);
  if (serverSession) {
    const userRole = getUserRole({ serverSession, workspaceId });
    const hasAccess = userRole !== MemberRole.Caller;
    if (!hasAccess) return redirect("..");
    return json(
      {
        phoneNumbers,
        workspaceId,
        mediaNames,
        users,
      },
      { headers },
    );
  }

  return json(
    {
      phoneNumbers,
      workspaceId,
      user: serverSession?.user,
      users,
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
  const { supabaseClient, headers } =
    await getSupabaseServerClientWithSession(request);

  const data = Object.fromEntries(await request.formData());
  const formName = data.formName;
  const workspace_id = params.id;
  if (formName === "caller-id") {
    delete data.formName;
    const res = await fetch(`${process.env.BASE_URL}/api/caller-id`, {
      body: JSON.stringify({ ...data, workspace_id }),
      headers: {
        "Content-Type": "application/json",
        ...headers,
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
  } else if (formName === "update-incoming-activity") {
    const { numberId, incomingActivity } = data;
    const { error: incomingActivityError } = await updateWorkspacePhoneNumber({
      supabaseClient,
      numberId,
      workspaceId: workspace_id,
      updates: { inbound_action: incomingActivity },
    });
    if (incomingActivityError) return { error: incomingActivityError };
    return null;
  } else if (formName === "update-incoming-voice-message") {
    const { numberId: voiceNumberId, incomingVoiceMessage } = data;
    const { error: incomingVoiceMessageError } =
      await updateWorkspacePhoneNumber({
        supabaseClient,
        numberId: voiceNumberId,
        workspaceId: workspace_id,
        updates: { inbound_audio: incomingVoiceMessage },
      });
    if (incomingVoiceMessageError) return { error: incomingVoiceMessageError };
    return null;
  } else if (formName === "update-caller-id") {
    const { numberId: voiceNumberId, friendly_name } = data;
    const { data: number, error: friendlyNameError } =
      await updateWorkspacePhoneNumber({
        supabaseClient,
        numberId: voiceNumberId,
        workspaceId: workspace_id,
        updates: { friendly_name },
      });
    if (friendlyNameError) return { error: friendlyNameError };
    const updateData = await updateCallerId({
      supabaseClient,
      workspaceId: workspace_id,
      number,
      friendly_name,
    });
    if (updateData?.error) return { error: updateData.error };
    return null;
  }
  return { error: "An unknown error occured" };
};

const WorkspaceSettings = () => {
  const {
    phoneNumbers: initNumbers,
    workspaceId,
    user,
    users,
    mediaNames,
  } = useLoaderData();
  const { supabase } = useOutletContext();
  const actionData = useActionData();
  const [isDialogOpen, setDialog] = useState(!!actionData?.data);
  const fetcher = useFetcher();
  const updateFetcher = useFetcher();

  const { phoneNumbers, setPhoneNumbers } = useSupabaseRealtime({
    supabase,
    user,
    workspace: workspaceId,
    init: { phoneNumbers: initNumbers, queue: [], callsList: [] },
    setQuestionContact: () => null,
  });

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (actionData?.validationRequest) {
      setDialog(true);
    }
  }, [actionData]);

  const handleIncomingActivityChange = (numberId, value) => {
    updateFetcher.submit(
      { formName: "update-incoming-activity", numberId, incomingActivity: value },
      { method: "POST" }
    );
  };

  const handleIncomingVoiceMessageChange = (numberId, value) => {
    updateFetcher.submit(
      { formName: "update-incoming-voice-message", numberId, incomingVoiceMessage: value },
      { method: "POST" }
    );
  };

  const handleCallerIdChange = (numberId, value) => {
    updateFetcher.submit(
      { formName: "update-caller-id", numberId, friendly_name: value },
      { method: "POST" }
    );
  };

  const handleNumberRemoval = (numberId) => {
    updateFetcher.submit(
      { formName: "remove-number", numberId },
      { method: "POST" }
    );
  };

  return (
    <>
      <VerificationDialog
        isOpen={isDialogOpen}
        onOpenChange={setDialog}
        validationRequest={actionData?.validationRequest}
      />
      <div className="flex flex-col min-h-screen">
        <BackButton disabled={updateFetcher.state !== "idle"} />
        <div className="flex flex-wrap p-4 gap-4">
          <Panel className="flex-grow flex-shrink-0 basis-full lg:basis-[calc(66.666%-1rem)]">
            <NumbersTable
              phoneNumbers={phoneNumbers}
              users={users}
              mediaNames={mediaNames}
              onIncomingActivityChange={handleIncomingActivityChange}
              onIncomingVoiceMessageChange={handleIncomingVoiceMessageChange}
              onCallerIdChange={handleCallerIdChange}
              onNumberRemoval={handleNumberRemoval}
              isBusy={updateFetcher.state !== "idle"}
            />
          </Panel>
          <div className="flex flex-col flex-grow flex-shrink-0 basis-full lg:basis-[calc(33.333%-1rem)] gap-4">
            <Panel>
              <NumberCallerId />
            </Panel>
            <Panel>
              <NumberPurchase fetcher={fetcher} workspaceId={workspaceId} />
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
};

const VerificationDialog = ({ isOpen, onOpenChange, validationRequest }) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="flex w-[450px] flex-col items-center bg-card">
      <DialogHeader>
        <DialogTitle className="text-center font-Zilla-Slab text-4xl text-primary">
          Your verification code
        </DialogTitle>
        <div className="w-[400px]">
          <p className="text-center">
            You will receive a call at {validationRequest?.phoneNumber}.
          </p>
          <div className="flex justify-center">
            <div className="my-4 rounded-md border-2 border-secondary bg-slate-50 p-4 text-5xl shadow-lg">
              {validationRequest?.validationCode}
            </div>
          </div>
          <p className="text-center">Enter this code when prompted</p>
        </div>
      </DialogHeader>
    </DialogContent>
  </Dialog>
);

const BackButton = ({ disabled }) => (
  <div className="flex justify-end pr-4 pt-4">
    <Button
      asChild
      disabled={disabled}
      variant="outline"
      className="h-full w-fit border-0 border-black bg-zinc-600 font-Zilla-Slab text-2xl font-semibold text-white dark:border-white"
    >
      <Link to=".." relative="path">
        Back
      </Link>
    </Button>
  </div>
);

const Panel = ({ children, className }) => (
  <div className={`rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white ${className}`}>
    {children}
  </div>
);
export default WorkspaceSettings;