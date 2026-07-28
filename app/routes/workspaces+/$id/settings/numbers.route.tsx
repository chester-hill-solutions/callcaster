export { loader } from "./numbers.loader.server";
export { action } from "./numbers.action.server";

import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";

import { Link, useActionData, useFetcher, useLoaderData, useOutletContext } from "react-router";
import { useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  useActionFeedback,
  useFetcherOnIdle,
  useSearchParamFlash,
} from "@/hooks/utils";
import {
  flashSearchParamWarning,
  flashServiceAddressSavedParam,
  useWorkspaceNumberSettingsMutations,
} from "@/hooks/phone";
import { Section, SectionHeader } from "@/components/shared/Section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
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
} from "@/components/phone-numbers/NumberSummaryList";
import { NumberCallerId } from "@/components/phone-numbers/NumberCallerId";
import { NumberPurchase } from "@/components/phone-numbers/NumberPurchase";
import { ServiceAddressGate } from "@/components/phone-numbers/ServiceAddressGate";
import { SmsComplianceGate } from "@/components/phone-numbers/SmsComplianceGate";
import {
  CallerIdVerificationDialog,
  type CallerIdValidationRequest,
} from "@/components/phone-numbers/CallerIdVerificationDialog";
import { User, WorkspaceNumbers } from "@/lib/types";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";



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

type LoaderData = {
  phoneNumbers: WorkspaceNumbers;
  workspaceId: string;
  mediaNames: { id: number; name: string }[];
  users: User[];
  user: User;
  queues: { id: number; name: string }[];
  scripts: { id: number; name: string }[];
  creditsBalance: number;
  onboarding: WorkspaceMessagingOnboardingState;
  userRole: string | null | undefined;
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
    onboarding,
    userRole,
  } = useLoaderData<LoaderData>();
  useOutletContext<{ }>();
  const isReadOnly = userRole !== "owner" && userRole !== "admin";
  const actionData = useActionData<CallerIDResponse>();
  const [isDialogOpen, setDialog] = useState<boolean>(
    !!actionData?.validationRequest,
  );
  const fetcher = useFetcher<NumbersSearchFetcherData>();
  const {
    fetcher: updateFetcher,
    isBusy,
    onIncomingActivityChange,
    onIncomingVoiceMessageChange,
    onCallerIdChange,
    onHandsetChange,
    onInboundRingCountChange,
    onInboundQueueChange,
    onInboundScriptChange,
    onApplyPreset,
    onNumberRemoval,
  } = useWorkspaceNumberSettingsMutations(workspaceId);
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

  useSearchParamFlash({
    saved: flashServiceAddressSavedParam,
    warning: flashSearchParamWarning,
  });

  const handleNumberRemoval = (numberId: number) => {
    setNumberPendingRemoval(numberId);
  };

  const confirmNumberRemoval = () => {
    if (numberPendingRemoval == null) return;
    onNumberRemoval(numberPendingRemoval);
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
              disabled={isBusy}
            >
              Release number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PageShell
        title="Phone numbers"
        description="Manage inbound routing, rent numbers, and verify caller IDs."
        actions={
          <Button
            asChild
            disabled={isBusy}
            variant="outline"
            size="sm"
          >
            <Link to=".." relative="path">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      >
        <div className="flex min-w-0 flex-col gap-0">
          <Section variant="flat" className="min-w-0">
            <SectionHeader
              branded={false}
              compact
              title="Your numbers"
              description="Set how each number routes inbound calls."
            />
            <NumberSummaryList
              phoneNumbers={phoneNumbers || []}
              users={users}
              mediaNames={mediaNames}
              queues={queues}
              scripts={scripts}
              onIncomingActivityChange={onIncomingActivityChange}
              onIncomingVoiceMessageChange={onIncomingVoiceMessageChange}
              onCallerIdChange={onCallerIdChange}
              onHandsetChange={onHandsetChange}
              onInboundRingCountChange={onInboundRingCountChange}
              onInboundQueueChange={onInboundQueueChange}
              onInboundScriptChange={onInboundScriptChange}
              onNumberRemoval={handleNumberRemoval}
              onApplyPreset={onApplyPreset}
              isBusy={isBusy}
            />
          </Section>
          <div className="min-w-0 space-y-6">
            <ServiceAddressGate
              workspaceId={workspaceId ?? ""}
              onboarding={onboarding}
              isReadOnly={isReadOnly}
            />
            <SmsComplianceGate
              workspaceId={workspaceId ?? ""}
              onboarding={onboarding}
              isReadOnly={isReadOnly}
            />
            <Section variant="flat" className="min-w-[300px]">
              <SectionHeader branded={false} compact title="Rent a number" />
              <NumberPurchase
                fetcher={fetcher}
                workspaceId={workspaceId ?? ""}
                creditsBalance={creditsBalance}
              />
            </Section>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="caller-id" className="border-border/60">
                <AccordionTrigger className="py-3 text-sm hover:no-underline">
                  Caller ID verification
                </AccordionTrigger>
                <AccordionContent>
                  <NumberCallerId />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </PageShell>
    </>
  );
};

export default WorkspaceSettings;
