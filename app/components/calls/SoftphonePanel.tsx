import type { ReactNode } from "react";
import type { Call } from "@twilio/voice-sdk";

import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { Text } from "@/components/ui/typography";
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
  outboundDialDisabledReason?: string;
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
  outboundDialDisabledReason,
  connectionStatus,
  onEndSession,
}: SoftphonePanelProps) {
  const { callHandling, incomingCall } = controller;
  const activeCall = callHandling.activeCall;

  return (
    <PageShell
      title={title}
      description={
        connectionStatus !== undefined ? `Status: ${connectionStatus}` : undefined
      }
      maxWidth="narrow"
    >
      {headerExtra}

      <div className="space-y-4 rounded-lg border border-border/80 p-4">
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <Text variant="muted" className="text-sm font-medium">
            {handsetNumberLabel}
          </Text>
          <p className="mt-1 font-mono text-lg">{handsetNumber}</p>
        </div>

        {controller.showOutboundDialer && (
          <OutboundDialer
            value={controller.outboundTo}
            error={controller.outboundError}
            disabled={outboundDialDisabled}
            disabledReason={outboundDialDisabledReason}
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
          />
        ) : (
          waitingContent ?? (
            <p className="text-center text-muted-foreground">Waiting for calls...</p>
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
            micMuted={callHandling.isMicMuted}
            callOnHold={callHandling.isActiveCallOnLocalHold}
            onMicChange={audio.handleMicChange}
            onSpeakerChange={audio.handleSpeakerChange}
            onMuteMic={audio.handleMuteMic}
            onHold={callHandling.holdActiveCall}
            onResume={() => callHandling.resumeActiveCall()}
            onHangUp={() => callHandling.hangUp()}
            onKeypadPress={controller.handleKeypadPress}
          />
        )}
      </div>

      <Button variant="ghost" className="w-full" onClick={onEndSession}>
        End session and leave
      </Button>
    </PageShell>
  );
}
