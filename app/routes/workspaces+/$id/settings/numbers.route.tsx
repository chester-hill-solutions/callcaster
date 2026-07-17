export { loader } from "./numbers.loader.server";
export { action } from "./numbers.action.server";

import TeamMember, { MemberRole } from "@/components/workspace/TeamMember";
import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect , Form, Link, useActionData, useFetcher, useLoaderData, useOutletContext } from "react-router";
import { useCallback, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useActionFeedback, useFetcherOnIdle } from "@/hooks/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


import { useWorkspaceRealtime } from "@/hooks/realtime/useWorkspaceRealtime";
import {
  NumberSummaryList,
  type RoutingPresetSubmission,
} from "@/components/phone-numbers/NumberSummaryList";
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
  useOutletContext<{ }>();
  const actionData = useActionData<CallerIDResponse>();
  const [isDialogOpen, setDialog] = useState<boolean>(
    !!actionData?.validationRequest,
  );
  const fetcher = useFetcher<NumbersSearchFetcherData>();
  const updateFetcher = useFetcher();
  const [numberPendingRemoval, setNumberPendingRemoval] = useState<
    number | null
  >(null);

  // Toast the outcome of inline row edits (and removals), which otherwise
  // save silently through updateFetcher. formData is only present while the
  // submission is in flight, so mirror the form name into a ref for the
  // idle callback.
  const pendingFormNameRef = useRef<string | null>(null);
  if (updateFetcher.formData) {
    pendingFormNameRef.current = String(
      updateFetcher.formData.get("formName") ?? "",
    );
  }
  useFetcherOnIdle(updateFetcher, (data) => {
    const formName = pendingFormNameRef.current;
    if (!formName) return;
    pendingFormNameRef.current = null;
    const error = (data as { error?: string } | null)?.error;
    if (error) {
      toast.error(error);
    } else if (formName === "remove-number") {
      toast.success("Number released");
    } else {
      toast.success("Number settings saved");
    }
  });

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
    setNumberPendingRemoval(numberId);
  };

  const handleApplyPreset = (submission: RoutingPresetSubmission) => {
    updateFetcher.submit(submission, { method: "POST" });
  };

  const confirmNumberRemoval = () => {
    if (numberPendingRemoval == null) return;
    updateFetcher.submit(
      { formName: "remove-number", numberId: String(numberPendingRemoval) },
      { method: "POST" },
    );
    setNumberPendingRemoval(null);
  };

  return (
    <>
      <CallerIdVerificationDialog
        isOpen={isDialogOpen}
        onOpenChange={setDialog}
        validationRequest={actionData?.validationRequest}
      />
      <Dialog
        open={numberPendingRemoval != null}
        onOpenChange={(open) => {
          if (!open) setNumberPendingRemoval(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release this phone number?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Releasing this number removes it from your workspace. Inbound calls
            and texts to it will stop, and you may not be able to get the same
            number back.
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNumberPendingRemoval(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmNumberRemoval}
              disabled={updateFetcher.state !== "idle"}
            >
              Release number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col">
        <BackButton disabled={updateFetcher.state !== "idle"} />
        <h1 className="px-4 pt-2 text-2xl font-semibold tracking-tight">
          Phone numbers
        </h1>
        <div className="flex min-w-0 flex-wrap gap-4 p-4">
          <Panel className="min-w-0 flex-shrink-0 flex-grow basis-full lg:basis-[calc(66.666%-1rem)]">
            <NumberSummaryList
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
              onApplyPreset={handleApplyPreset}
              isBusy={updateFetcher.state !== "idle"}
            />
          </Panel>
          <div className="flex min-w-0 flex-shrink-0 flex-grow basis-full flex-col gap-4 lg:basis-[calc(33.333%-1rem)]">
            <Panel className="min-w-0">
              <NumberCallerId />
            </Panel>
            <Panel className="min-w-0">
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
    <Button asChild disabled={disabled} variant="outline" size="sm">
      <Link to=".." relative="path">
        <ArrowLeft className="mr-1 h-4 w-4" />
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
