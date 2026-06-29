import { QueueList } from "@/components/call/CallScreen.QueueList";
import { CallArea } from "@/components/call/CallScreen.CallArea";
import { CallQuestionnaire } from "@/components/call/CallScreen.Questionnaire";
import { Household } from "@/components/call/CallScreen.Household";
import { CampaignHeader } from "@/components/call/CallScreen.Header";
import { PhoneKeypad } from "@/components/call/CallScreen.DTMFPhone";
import { CampaignDialogs } from "@/components/call/CallScreen.Dialogs";
import {
  declineIncomingCall,
  IncomingCallPanel,
} from "@/components/calls/IncomingCallPanel";
import type { Call } from "@twilio/voice-sdk";
import type { CallScreenLayoutProps } from "@/hooks/call/useCallScreen";
import type { ActiveCall, CampaignDetails, QueueItem } from "@/lib/types";
import { Tables } from "@/lib/database.types";

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
  callControls,
  queueControls,
  formState,
  dialogControls,
  audioControls,
  phoneVerification,
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

  const {
    questionContact,
    attemptList,
    handleResponse,
    update,
    saveData,
  } = formState;

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
    pin,
  } = phoneVerification;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border-2 border-brand-secondary/40 p-4 sm:p-6 lg:flex-row lg:items-start">
        <CampaignHeader
          className="min-w-0 flex-1"
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
          pin={pin || ""}
        />
        <div className="shrink-0 self-center lg:self-start">
          <PhoneKeypad
            onKeyPress={handleDTMF}
            displayState={displayState}
            displayColor={displayColor}
            callDuration={callDuration}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-6">
          {incomingCall ? (
            <IncomingCallPanel
              incomingCall={incomingCall as Call}
              callHandling={{
                activeCall: (activeCall as Call | null) ?? null,
                answer: answer ?? (() => undefined),
                holdAndAnswer: holdAndAnswer ?? (() => undefined),
              }}
              onDecline={() => declineIncomingCall(incomingCall as Call)}
            />
          ) : null}
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
                ? () => handleConferenceEnd({
                  activeCall: activeCall as unknown as ActiveCall,
                  setConference: () => setConference(null),
                  workspaceId,
                })
                : () => {
                  if (hangUp) hangUp();
                }
            }
            displayState={displayState}
            dispositionOptions={((campaignDetails.disposition_options as unknown) as string[]).map((option) => ({
              value: option,
              label: option,
            }))}
            handleDialNext={handleDialButton}
            handleDequeueNext={handleDequeueNext}
            disposition={disposition}
            setDisposition={setDisposition}
            recentAttempt={recentAttempt}
            callState={callState}
            callDuration={callDuration}
            voiceDrop={Boolean(campaignDetails.voicedrop_audio)}
          />
          <Household
            isBusy={isBusy}
            house={house ?? []}
            switchQuestionContact={(args: { contact: QueueItem }) => switchQuestionContact({ contact: args.contact })}
            attemptList={attemptList as unknown as (Tables<"outreach_attempt"> & { result?: { status?: string } })[]}
            questionContact={questionContact}
          />
        </div>
        <CallQuestionnaire
          isBusy={isBusy}
          handleResponse={(response: { pageId: string; blockId: string; value: string | number | boolean | string[] | null | undefined }) => {
            const value = response.value;
            if (value !== undefined && value !== null) {
              handleResponse({ blockId: response.blockId, value: typeof value === "string" || Array.isArray(value) ? value : String(value) });
            }
          }}
          campaignDetails={campaignDetails as unknown as CampaignDetails & { script: { steps: { pages?: Record<string, { id: string; title: string; blocks: string[] }>; blocks?: Record<string, { id: string; type: string; title: string; content: string; options?: Array<{ value: string; label: string; next: string }>; audioFile: string }> } } }}
          update={(update || {}) as Record<string, Record<string, string | number | boolean | string[] | null | undefined>>}
          nextRecipient={questionContact}
          handleQuickSave={saveData}
          disabled={!questionContact}
        />
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
      </div>
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
        }}
        fetchMore={fetchMore as unknown as (params: Record<string, unknown>) => void}
        householdMap={householdMap}
        currentState={currentState}
        isActive={isActive}
        creditsError={credits === 0 || creditsError}
        hasAccess={hasAccess}
      />
    </div>
  );
}
