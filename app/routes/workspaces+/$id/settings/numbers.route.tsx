export { loader } from "./numbers.loader.server";
export { action } from "./numbers.action.server";

import TeamMember, { MemberRole } from "@/components/workspace/TeamMember";
import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect } from "react-router";
import { Form, Link, useActionData, useFetcher, useLoaderData, useOutletContext } from "react-router";
import { useCallback, useState } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { Button } from "@/components/ui/button";


import { useWorkspaceRealtime } from "@/hooks/realtime/useWorkspaceRealtime";
import { NumbersTable } from "@/components/phone-numbers/NumbersTable";
import { NumberCallerId } from "@/components/phone-numbers/NumberCallerId";
import { NumberPurchase } from "@/components/phone-numbers/NumberPurchase";
import {
  CallerIdVerificationDialog,
  type CallerIdValidationRequest,
} from "@/components/phone-numbers/CallerIdVerificationDialog";
import { User, WorkspaceNumbers } from "@/lib/types";



type ValidationRequest = CallerIdValidationRequest;

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

interface FormData {
  formName: string;
  numberId?: string;
  incomingActivity?: string;
  incomingVoiceMessage?: string;
  callerId?: string;
  [key: string]: unknown;
}

type LoaderData = {
  phoneNumbers: WorkspaceNumbers;
  workspaceId: string;
  mediaNames: { id: number; name: string }[];
  users: User[];
  user: User;
  queues: { id: number; name: string }[];
  scripts: { id: number; name: string }[];
  creditsBalance: number;
};

const WorkspaceSettings = () => {
  const {
    phoneNumbers: initNumbers,
    workspaceId,
    user,
    users,
    mediaNames,
    queues,
    scripts,
    creditsBalance,
  } = useLoaderData<LoaderData>();
  const { client } = useOutletContext<{ }>();
  const actionData = useActionData<CallerIDResponse>();
  const [isDialogOpen, setDialog] = useState<boolean>(
    !!actionData?.validationRequest,
  );
  const fetcher = useFetcher<NumbersSearchFetcherData>();
  const updateFetcher = useFetcher();

  const { phoneNumbers, setPhoneNumbers } = useWorkspaceRealtime({
    user,
    workspace: workspaceId,
    init: {
      phoneNumbers: Array.isArray(initNumbers)
        ? initNumbers
        : initNumbers
          ? [initNumbers]
          : [],
      queue: [],
      callsList: [],
      predictiveQueue: [],
      attempts: [],
      recentCall: null,
      recentAttempt: null,
      nextRecipient: null,
    },
    campaign_id: "",
    predictive: false,
    setQuestionContact: () => null,
    setCallDuration: () => null,
    setUpdate: () => null,
  });

  useActionFeedback(actionData, {
    getError: (data) => data?.error,
    getSuccess: (data) => Boolean(data?.validationRequest),
    onSuccess: () => setDialog(true),
    successMessage: undefined,
  });

  const handleIncomingActivityChange = (numberId: number, value: string) => {
    updateFetcher.submit(
      {
        formName: "update-incoming-activity",
        numberId: String(numberId),
        incomingActivity: value,
      },
      { method: "POST" },
    );
  };

  const handleIncomingVoiceMessageChange = (
    numberId: number,
    value: string,
  ) => {
    updateFetcher.submit(
      {
        formName: "update-incoming-voice-message",
        numberId: String(numberId),
        incomingVoiceMessage: value,
      },
      { method: "POST" },
    );
  };

  const handleCallerIdChange = (numberId: number, value: string) => {
    updateFetcher.submit(
      {
        formName: "update-caller-id",
        numberId: String(numberId),
        friendly_name: value,
      },
      { method: "POST" },
    );
  };

  const handleHandsetChange = (numberId: number, enabled: boolean) => {
    updateFetcher.submit(
      {
        formName: "update-handset",
        numberId: String(numberId),
        handsetEnabled: String(enabled),
      },
      { method: "POST" },
    );
  };

  const handleInboundRingCountChange = (numberId: number, value: string) => {
    updateFetcher.submit(
      {
        formName: "update-inbound-ring-count",
        numberId: String(numberId),
        inboundRingCount: value,
      },
      { method: "POST" },
    );
  };

  const handleInboundQueueChange = (numberId: number, queueId: string) => {
    updateFetcher.submit(
      {
        formName: "update-inbound-queue",
        numberId: String(numberId),
        inboundQueueId: queueId,
      },
      { method: "POST" },
    );
  };

  const handleInboundScriptChange = (numberId: number, scriptId: string) => {
    updateFetcher.submit(
      {
        formName: "update-inbound-script",
        numberId: String(numberId),
        inboundScriptId: scriptId,
      },
      { method: "POST" },
    );
  };

  const handleNumberRemoval = (numberId: number) => {
    updateFetcher.submit(
      { formName: "remove-number", numberId: String(numberId) },
      { method: "POST" },
    );
  };

  return (
    <>
      <CallerIdVerificationDialog
        isOpen={isDialogOpen}
        onOpenChange={setDialog}
        validationRequest={actionData?.validationRequest}
      />
      <div className="flex min-h-screen flex-col">
        <BackButton disabled={updateFetcher.state !== "idle"} />
        <div className="flex flex-wrap gap-4 p-4">
          <Panel className="flex-shrink-0 flex-grow basis-full lg:basis-[calc(66.666%-1rem)]">
            <NumbersTable
              phoneNumbers={phoneNumbers || []}
              users={users}
              mediaNames={mediaNames}
              queues={queues}
              scripts={scripts}
              onIncomingActivityChange={handleIncomingActivityChange}
              onIncomingVoiceMessageChange={handleIncomingVoiceMessageChange}
              onCallerIdChange={handleCallerIdChange}
              onHandsetChange={handleHandsetChange}
              onInboundRingCountChange={handleInboundRingCountChange}
              onInboundQueueChange={handleInboundQueueChange}
              onInboundScriptChange={handleInboundScriptChange}
              onNumberRemoval={handleNumberRemoval}
              isBusy={updateFetcher.state !== "idle"}
            />
          </Panel>
          <div className="flex flex-shrink-0 flex-grow basis-full flex-col gap-4 lg:basis-[calc(33.333%-1rem)]">
            <Panel className="">
              <NumberCallerId />
            </Panel>
            <Panel className="">
              <NumberPurchase
                fetcher={fetcher}
                workspaceId={workspaceId ?? ""}
                creditsBalance={creditsBalance}
              />
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
};

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

const Panel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) => (
  <div
    className={`rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white ${className}`}
  >
    {children}
  </div>
);
export default WorkspaceSettings;
