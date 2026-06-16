import type { ReactNode } from "react";
import type { Call } from "@twilio/voice-sdk";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/CustomCard";
import { HeldCallsList } from "@/components/calls/HeldCallsList";
import { IncomingCallPanel } from "@/components/calls/IncomingCallPanel";
import { OutboundDialer } from "@/components/calls/OutboundDialer";
import { SoftphoneAudioControls } from "@/components/calls/SoftphoneAudioControls";
import type { SoftphoneController } from "@/hooks/call/useSoftphoneController";
import type { useSoftphoneAudioDevices } from "@/hooks/call/useSoftphoneAudioDevices";

type SoftphoneAudioState = ReturnType<typeof useSoftphoneAudioDevices>;

type SoftphonePanelProps = {
  title: string;
  handsetNumber: string;
  handsetNumberLabel: string;
  idPrefix: string;
  controller: SoftphoneController;
  audio: SoftphoneAudioState;
  headerExtra?: ReactNode;
  waitingContent?: ReactNode;
  outboundDialDisabled?: boolean;
  connectionStatus?: string;
  onEndSession: () => void;
};

export function SoftphonePanel({
  title,
  handsetNumber,
  handsetNumberLabel,
  idPrefix,
  controller,
  audio,
  headerExtra,
  waitingContent,
  outboundDialDisabled = false,
  connectionStatus,
  onEndSession,
}: SoftphonePanelProps) {
  const { callHandling, incomingCall } = controller;
  const activeCall = callHandling.activeCall;

  return (
    <div className="container mx-auto max-w-lg p-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        {connectionStatus !== undefined && (
          <p className="mt-1 text-sm text-muted-foreground">
            Status: {connectionStatus}
          </p>
        )}
        {headerExtra}

        <div className="mt-4 rounded-lg bg-muted p-4">
          <p className="text-sm font-medium text-muted-foreground">
            {handsetNumberLabel}
          </p>
          <p className="mt-1 font-mono text-lg">{handsetNumber}</p>
        </div>

        {controller.showOutboundDialer && (
          <OutboundDialer
            value={controller.outboundTo}
            error={controller.outboundError}
            disabled={outboundDialDisabled}
            onChange={controller.setOutboundTo}
            onDial={controller.handleOutboundDial}
            onClearError={controller.clearOutboundError}
          />
        )}

        {incomingCall ? (
          <IncomingCallPanel
            incomingCall={incomingCall}
            callHandling={callHandling}
            onDecline={controller.handleDecline}
            className="mt-6"
          />
        ) : (
          waitingContent ?? (
            <p className="mt-6 text-center text-muted-foreground">
              Waiting for calls...
            </p>
          )
        )}

        <HeldCallsList
          heldCalls={callHandling.heldCalls}
          onSwitch={(call: Call) => callHandling.switchTo(call)}
          onHangUp={(call: Call) => callHandling.hangUp(call)}
        />

        {activeCall && (
          <SoftphoneAudioControls
            idPrefix={idPrefix}
            microphones={audio.microphones}
            speakers={audio.speakers}
            selectedMicId={audio.selectedMicId}
            selectedSpeakerId={audio.selectedSpeakerId}
            micMuted={audio.micMuted}
            speakerMuted={audio.speakerMuted}
            callOnHold={audio.callOnHold}
            onMicChange={audio.handleMicChange}
            onSpeakerChange={audio.handleSpeakerChange}
            onMuteMic={audio.handleMuteMic}
            onMuteSpeaker={audio.handleMuteSpeaker}
            onHold={audio.handleHold}
            onResume={audio.handleResume}
            onHangUp={() => callHandling.hangUp()}
            onKeypadPress={controller.handleKeypadPress}
          />
        )}

        <Button variant="ghost" className="mt-6 w-full" onClick={onEndSession}>
          End session and leave
        </Button>
      </Card>
    </div>
  );
}
