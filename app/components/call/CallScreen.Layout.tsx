import { QueueList } from "@/components/call/CallScreen.QueueList";
import {
  CallArea,
  DispositionBar,
} from "@/components/call/CallScreen.CallArea";
import { CallQuestionnaire } from "@/components/call/CallScreen.Questionnaire";
import { Household } from "@/components/call/CallScreen.Household";
import { CampaignHeader, TopChrome } from "@/components/call/CallScreen.Header";
import { PhoneKeypad } from "@/components/call/CallScreen.DTMFPhone";
import { CampaignDialogs } from "@/components/call/CallScreen.Dialogs";
import { CallScreenLiveCoachingPanels } from "@/components/call/CallScreen.LiveCoachingPanels";
import { OperatorColumn } from "@/components/call/CallScreen.OperatorColumn";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavLink } from "react-router";
import { Grid3X3, List, Settings } from "lucide-react";
import {
  declineIncomingCall,
  IncomingCallPanel,
} from "@/components/calls/IncomingCallPanel";
import type { Call } from "@twilio/voice-sdk";
import type { CallScreenLayoutProps } from "@/hooks/call/useCallScreen";
import type { ActiveCall, CampaignDetails, QueueItem } from "@/lib/types";
import type { ReactNode } from "react";
import type { Tables } from "@/lib/db-types";
import { normalizeDispositionOptions } from "@/lib/outreach-disposition";

function ErrorBanner({
  title,
  text,
  children,
  testId,
}: {
  title: string;
  text?: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center"
      data-testid={testId}
      role="alert"
    >
      <p className="font-Zilla-Slab text-xl font-semibold">{title}</p>
      {text ? <p className="mt-2 text-sm">{text}</p> : null}
      {children}
    </div>
  );
}

export function CallScreenLayout({
  isBusy,
  campaign,
  count,
  completed,
  workspaceId,
  campaignDetails,
  credits,
  isActive,
  hasAccess,
  verifiedNumbers,
  navigate,
  device,
  currentState,
  creditsError,
  deviceError,
  callControls,
  queueControls,
  formState,
  dialogControls,
  audioControls,
  phoneVerification,
  featureFlags,
  callSid,
  initialCoaching,
}: CallScreenLayoutProps) {
  const {
    hangUp,
    answer,
    holdAndAnswer,
    incomingCall,
    activeCall,
    callState,
    callDuration,
    deviceIsBusy,
    handleDialButton,
    handleDequeueNext,
    handleVoiceDrop,
    handleConferenceEnd,
    displayState,
    displayColor,
    conference,
    setConference,
    disposition,
    setDisposition,
    recentCall,
    recentAttempt,
    availableCredits,
    creditState,
    reconnectDevice,
  } = callControls;

  const {
    queue,
    predictiveQueue,
    nextRecipient,
    house,
    switchQuestionContact,
    handleNextNumber,
    fetchMore,
    householdMap,
    groupByHousehold,
    requeueContacts,
  } = queueControls;

  const { questionContact, attemptList, handleResponse, update, saveData } =
    formState;

  const {
    isDialogOpen,
    setDialog,
    isErrorDialogOpen,
    setErrorDialog,
    isReportDialogOpen,
    setReportDialog,
  } = dialogControls;

  const {
    stream,
    availableMicrophones,
    availableSpeakers,
    selectedMicrophone,
    selectedSpeaker,
    handleMicrophoneChange,
    handleSpeakerChange,
    handleMuteMicrophone,
    isMicrophoneMuted,
    handleDTMF,
  } = audioControls;

  const {
    phoneConnectionStatus,
    selectedDevice,
    setSelectedDevice,
    isAddingNumber,
    setIsAddingNumber,
    newPhoneNumber,
    setNewPhoneNumber,
    handleVerifyNewNumber,
    verificationPhoneNumber,
  } = phoneVerification;
  const dispositionOptions = normalizeDispositionOptions(
    campaignDetails.disposition_options,
  ).map((option) => ({
    value: option,
    label: option,
  }));

  return (
    <div className="w-full space-y-6">
      {Number(credits) <= 0 ? (
        <ErrorBanner
          testId="credits-error-banner"
          title={
            hasAccess ? "Credit balance depleted" : "Campaign credits required"
          }
          text={
            hasAccess
              ? "Add credits to continue this campaign."
              : "Contact a workspace administrator to continue this campaign."
          }
        >
          {hasAccess ? (
            <Button asChild className="mt-3">
              <NavLink to="../../../billing" relative="path">
                Add credits
              </NavLink>
            </Button>
          ) : null}
        </ErrorBanner>
      ) : null}
      {creditsError && Number(credits) > 0 ? (
        <ErrorBanner
          title="Credit check failed"
          text="The system was unable to verify credits. Check your balance or try again."
        />
      ) : null}
      {deviceError ? (
        <ErrorBanner
          testId="device-error-banner"
          title="Phone connection error"
          text={deviceError.message}
        >
          <Button className="mt-3" onClick={reconnectDevice}>
            Reconnect phone
          </Button>
        </ErrorBanner>
      ) : null}
      <TopChrome
        campaign={campaign}
        count={count}
        completed={completed}
        availableCredits={availableCredits}
        creditState={creditState}
        hasAccess={hasAccess}
        predictive={campaign.dial_type === "predictive"}
        onLeaveCampaign={() => {
          hangUp();
          device?.destroy();
          requeueContacts();
          navigate(-1);
        }}
        onReportError={() => setReportDialog(!isReportDialogOpen)}
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Open queue"
            >
              <List className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(92vw,32rem)] overflow-y-auto sm:max-w-lg">
            <SheetHeader className="mb-4">
              <SheetTitle>Call queue</SheetTitle>
              <SheetDescription>
                Review recipients, skip contacts, or load the next queue.
              </SheetDescription>
            </SheetHeader>
            <QueueList
              isBusy={isBusy}
              householdMap={householdMap}
              groupByHousehold={groupByHousehold}
              queue={campaign.dial_type === "call" ? queue : predictiveQueue}
              handleNextNumber={handleNextNumber}
              nextRecipient={nextRecipient}
              handleQueueButton={() => fetchMore({ householdMap })}
              predictive={campaign.dial_type === "predictive"}
              count={count}
              completed={completed}
            />
          </SheetContent>
        </Sheet>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Open keypad"
            >
              <Grid3X3 className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(92vw,22rem)]">
            <SheetHeader className="mb-4">
              <SheetTitle>DTMF keypad</SheetTitle>
              <SheetDescription>
                Send keypad tones during the active call. Keyboard digits remain
                available.
              </SheetDescription>
            </SheetHeader>
            <PhoneKeypad
              onKeyPress={handleDTMF}
              displayState={displayState}
              displayColor={displayColor}
              callDuration={callDuration}
              showStatus={false}
            />
          </SheetContent>
        </Sheet>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Open call settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(94vw,38rem)] overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Call settings</SheetTitle>
              <SheetDescription>
                Choose audio devices, calling device, and microphone state.
              </SheetDescription>
            </SheetHeader>
            <CampaignHeader
              settingsOnly
              className="px-0"
              campaign={campaign}
              count={count}
              completed={completed}
              onLeaveCampaign={() => {
                hangUp();
                device?.destroy();
                requeueContacts();
                navigate(-1);
              }}
              onReportError={() => setReportDialog(!isReportDialogOpen)}
              mediaStream={stream}
              availableMicrophones={availableMicrophones}
              availableSpeakers={availableSpeakers}
              selectedMicrophone={selectedMicrophone}
              selectedSpeaker={selectedSpeaker}
              handleMicrophoneChange={handleMicrophoneChange}
              handleSpeakerChange={handleSpeakerChange}
              handleMuteMicrophone={handleMuteMicrophone}
              isMicrophoneMuted={isMicrophoneMuted}
              availableCredits={availableCredits}
              creditState={creditState}
              hasAccess={hasAccess}
              phoneStatus={phoneConnectionStatus}
              selectedDevice={selectedDevice}
              onDeviceSelect={setSelectedDevice}
              verifiedNumbers={verifiedNumbers}
              isAddingNumber={isAddingNumber}
              onAddNumberClick={() => setIsAddingNumber(true)}
              onAddNumberCancel={() => setIsAddingNumber(false)}
              newPhoneNumber={newPhoneNumber}
              onNewPhoneNumberChange={setNewPhoneNumber}
              onVerifyNewNumber={handleVerifyNewNumber}
              verificationPhoneNumber={verificationPhoneNumber}
            />
          </SheetContent>
        </Sheet>
      </TopChrome>
      <OperatorColumn
        incoming={
          incomingCall &&
          callState !== "dialing" &&
          callState !== "connected" ? (
            <IncomingCallPanel
              incomingCall={incomingCall as Call}
              callHandling={{
                activeCall: (activeCall as Call | null) ?? null,
                answer: answer ?? (() => undefined),
                holdAndAnswer: holdAndAnswer ?? (() => undefined),
              }}
              onDecline={() => declineIncomingCall(incomingCall as Call)}
            />
          ) : null
        }
        call={
          <CallArea
            conference={conference ? { parameters: { Sid: conference } } : null}
            isBusy={isBusy || deviceIsBusy}
            predictive={campaign.dial_type === "predictive"}
            nextRecipient={nextRecipient}
            activeCall={activeCall as unknown as ActiveCall}
            recentCall={recentCall}
            handleVoiceDrop={handleVoiceDrop}
            hangUp={
              campaign.dial_type === "predictive"
                ? () =>
                    handleConferenceEnd({
                      activeCall: activeCall as unknown as ActiveCall,
                      setConference: () => setConference(null),
                      workspaceId,
                    })
                : () => {
                    if (hangUp) hangUp();
                  }
            }
            displayState={displayState}
            dispositionOptions={dispositionOptions}
            handleDialNext={handleDialButton}
            handleDequeueNext={handleDequeueNext}
            disposition={disposition}
            setDisposition={setDisposition}
            recentAttempt={recentAttempt}
            callState={callState}
            callDuration={callDuration}
            voiceDrop={Boolean(campaignDetails.voicedrop_audio)}
            showDisposition={false}
          />
        }
        disposition={
          <DispositionBar
            isBusy={isBusy || deviceIsBusy}
            nextRecipient={nextRecipient}
            handleDequeueNext={handleDequeueNext}
            disposition={disposition}
            dispositionOptions={dispositionOptions}
            setDisposition={setDisposition}
          />
        }
        household={
          house?.length ? (
            <Household
              isBusy={isBusy}
              house={house}
              switchQuestionContact={(args: { contact: QueueItem }) =>
                switchQuestionContact({ contact: args.contact })
              }
              attemptList={
                attemptList as unknown as (Tables<"outreach_attempt"> & {
                  result?: { status?: string };
                })[]
              }
              questionContact={questionContact}
            />
          ) : null
        }
        script={
          <CallQuestionnaire
            key={questionContact?.contact_id ?? "none"}
            isBusy={isBusy}
            handleResponse={(response: {
              pageId: string;
              blockId: string;
              value: string | number | boolean | string[] | null | undefined;
            }) => {
              const value = response.value;
              if (value !== undefined && value !== null) {
                handleResponse({
                  blockId: response.blockId,
                  value:
                    typeof value === "string" || Array.isArray(value)
                      ? value
                      : String(value),
                });
              }
            }}
            campaignDetails={
              campaignDetails as unknown as CampaignDetails & {
                script: {
                  steps: {
                    pages?: Record<
                      string,
                      { id: string; title: string; blocks: string[] }
                    >;
                    blocks?: Record<
                      string,
                      {
                        id: string;
                        type: string;
                        title: string;
                        content: string;
                        options?: Array<{
                          value: string;
                          label: string;
                          next: string;
                        }>;
                        audioFile: string;
                      }
                    >;
                  };
                };
              }
            }
            update={
              (update || {}) as Record<
                string,
                Record<
                  string,
                  string | number | boolean | string[] | null | undefined
                >
              >
            }
            nextRecipient={questionContact}
            handleQuickSave={saveData}
            disabled={!questionContact}
          />
        }
      />
      <CallScreenLiveCoachingPanels
        workspaceId={workspaceId}
        callSid={callSid}
        featureFlags={featureFlags}
        initialCoaching={initialCoaching}
      />
      <CampaignDialogs
        isDialogOpen={isDialogOpen}
        setDialog={setDialog}
        isErrorDialogOpen={isErrorDialogOpen}
        setErrorDialog={setErrorDialog}
        isReportDialogOpen={isReportDialogOpen}
        setReportDialog={setReportDialog}
        campaign={{
          title: campaign.title,
          dial_type: campaign.dial_type || "call",
          voicemail_file: Boolean(campaign.voicemail_file),
          status: campaign.status,
        }}
        fetchMore={
          fetchMore as unknown as (params: Record<string, unknown>) => void
        }
        householdMap={householdMap}
        currentState={currentState}
        isActive={isActive}
      />
    </div>
  );
}
