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
import { verifyAuth } from "~/lib/supabase.server";
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
import { SupabaseClient } from "@supabase/supabase-js";

type LoaderData = {
  phoneNumbers: WorkspaceNumbers;
  workspaceId: string;
  mediaNames: { id: number; name: string; }[];
  users: User[];
  user: User;
};

export type FetcherData = {
  data: WorkspaceNumbers[] | [];
  error?: string;
};
export type ActionData = {
  data: {
    validationRequest?: ValidationRequest;
    numberRequest?: NumberRequest;
  }
  error?: string;
};
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return redirect("/signin");
  }
  const { data: users, error } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });
  const { data: phoneNumbers, error: numbersError } =
    await getWorkspacePhoneNumbers({ supabaseClient, workspaceId });
  const { data: mediaNames } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspaceId);
  if (user) {
    const userRole = getUserRole({ user: user as User, workspaceId });
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
      user,
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
  error?: string;
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);

  const data = Object.fromEntries(await request.formData());
  const formName = data.formName;
  const workspace_id = params.id;
  if (!workspace_id) return { error: "Workspace ID is required" };

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
      numberId: data.numberId as unknown as bigint,
      workspaceId: workspace_id as string,
    });
    if (error) return { error };
    return null;

  } else if (formName === "update-incoming-activity") {
    const { numberId, incomingActivity } = data;
    const { error: incomingActivityError } = await updateWorkspacePhoneNumber({
      supabaseClient,
      numberId: numberId as string,
      workspaceId: workspace_id as string,
      updates: { inbound_action: incomingActivity as string },
    });
    if (incomingActivityError) return { error: incomingActivityError };
    return null;

  } else if (formName === "update-incoming-voice-message") {
    const { numberId: voiceNumberId, incomingVoiceMessage } = data;
    const { error: incomingVoiceMessageError } =
      await updateWorkspacePhoneNumber({
        supabaseClient,
        numberId: voiceNumberId as string,
        workspaceId: workspace_id as string,
        updates: { inbound_audio: incomingVoiceMessage as string },
      });
    if (incomingVoiceMessageError) return { error: incomingVoiceMessageError };
    return null;

  } else if (formName === "update-caller-id") {
    const { numberId: voiceNumberId, friendly_name } = data;
    const { data: number, error: friendlyNameError } =
      await updateWorkspacePhoneNumber({
        supabaseClient,
        numberId: voiceNumberId as string,
        workspaceId: workspace_id as string,
        updates: { friendly_name: friendly_name as string },
      });
    if (friendlyNameError) return { error: friendlyNameError };
    const updateData = await updateCallerId({
      supabaseClient,
      workspaceId: workspace_id as string,
      number,
      friendly_name: friendly_name as string,
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
  } = useLoaderData<LoaderData>();
  const { supabase } = useOutletContext<{ supabase: SupabaseClient }>();
  const actionData = useActionData<CallerIDResponse>();
  const [isDialogOpen, setDialog] = useState<boolean>(!!actionData?.validationRequest);
  const fetcher = useFetcher<FetcherData>();
  const updateFetcher = useFetcher();

  const { phoneNumbers, setPhoneNumbers } = useSupabaseRealtime({
    supabase,
    user,
    workspace: workspaceId,
    init: {
      phoneNumbers: initNumbers,
      queue: [],
      callsList: [],
      predictiveQueue: [],
      attempts: [],
      recentCall: null,
      recentAttempt: null,
      nextRecipient: null
    },
    campaign_id: '',
    predictive: false,
    setQuestionContact: () => null,
    setCallDuration: () => null,
    setUpdate: () => null,
  });

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (actionData?.validationRequest) {
      setDialog(true);
    }
  }, [actionData]);

  const handleIncomingActivityChange = (numberId: number, value: string) => {
    updateFetcher.submit(
      { formName: "update-incoming-activity", numberId: String(numberId), incomingActivity: value },
      { method: "POST" }
    );
  };

  const handleIncomingVoiceMessageChange = (numberId: number, value: string) => {
    updateFetcher.submit(
      { formName: "update-incoming-voice-message", numberId: String(numberId), incomingVoiceMessage: value },
      { method: "POST" }
    );
  };

  const handleCallerIdChange = (numberId: number, value: string) => {
    updateFetcher.submit(
      { formName: "update-caller-id", numberId: String(numberId), friendly_name: value },
      { method: "POST" }
    );
  };

  const handleNumberRemoval = (numberId: number) => {
    updateFetcher.submit(
      { formName: "remove-number", numberId: String(numberId) },
      { method: "POST" }
    );
  };

  return (
    <>
      <VerificationDialog
        isOpen={isDialogOpen}
        onOpenChange={setDialog}
        validationRequest={actionData?.validationRequest as ValidationRequest}
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
            <Panel className="" >
              <NumberCallerId />
            </Panel>
            <Panel className="">
              <NumberPurchase fetcher={fetcher} workspaceId={workspaceId ?? ""} />
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
};

const VerificationDialog = ({ isOpen, onOpenChange, validationRequest }: { isOpen: boolean, onOpenChange: (open: boolean) => void, validationRequest: ValidationRequest }) => (
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

const BackButton = ({ disabled }: { disabled: boolean }) => (
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

const Panel = ({ children, className }: { children: React.ReactNode, className: string }) => (
  <div className={`rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white ${className}`}>
    {children}
  </div>
);
export default WorkspaceSettings;