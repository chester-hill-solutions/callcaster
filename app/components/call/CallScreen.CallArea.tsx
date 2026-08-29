import { useState, useEffect, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import type { Tables } from "@/lib/db-types";
import { QueueItem } from "@/lib/types";
import { formatTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { callPanelShellClass } from "@/components/call/call-panel-classes";
import { formatDispositionLabel } from "@/lib/outreach-disposition";

type Attempt = Tables<"outreach_attempt">;
type Call = Tables<"call">;

interface ActiveCall {
  parameters: {
    CallSid: string;
  };
}

interface Conference {
  parameters: {
    Sid: string;
  };
}

export interface CallAreaProps {
  isBusy: boolean;
  nextRecipient: QueueItem | null;
  /**
   * The contact the script/disposition panel is currently recording an
   * outcome for. Distinct from `nextRecipient` (the queue's next-to-dial
   * pointer): hanging up dequeues the just-finished contact immediately
   * (#1253), which can null out or advance `nextRecipient` before the agent
   * has recorded a disposition. `questionContact` holds steady through that
   * so the disposition control stays usable until the agent saves or the
   * next dial starts.
   */
  questionContact: QueueItem | null;
  activeCall: ActiveCall | null;
  recentCall: Call | null;
  hangUp: () => void;
  handleVoiceDrop: () => void;
  handleDialNext: () => void;
  handleDequeueNext: () => void;
  disposition: string;
  dispositionOptions: Array<{ value: string; label: string }>;
  setDisposition: (disposition: string) => void;
  recentAttempt: Attempt | null;
  predictive: boolean;
  conference: Conference | null;
  voiceDrop: boolean;
  displayState: string;
  callState: string;
  callDuration: number;
  isMicrophoneMuted?: boolean;
  onToggleMute?: () => void;
  onLoadQueue?: () => void;
  onResetCall?: () => void;
}

function statusBarClass(displayState: string): string {
  if (displayState === "failed") {
    return "bg-primary";
  }
  if (displayState === "connected" || displayState === "dialing") {
    return "bg-success";
  }
  return "bg-muted-foreground";
}

export function StatusBar({
  displayState,
  callDuration,
}: Pick<CallAreaProps, "displayState" | "callDuration">) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-t-[14px] px-4 py-3 font-Tabac-Slab text-xl text-white",
        statusBarClass(displayState),
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {displayState === "failed" && <div>Call Failed</div>}
      {displayState === "dialing" && (
        <div>Dialing... {formatTime(callDuration)}</div>
      )}
      {displayState === "connected" && (
        <div>Connected {formatTime(callDuration)}</div>
      )}
      {displayState === "no-answer" && <div>No Answer</div>}
      {displayState === "voicemail" && <div>Voicemail Left</div>}
      {displayState === "completed" && <div>Call Completed</div>}
      {(!displayState || displayState === "idle") && <div>Pending</div>}
    </div>
  );
}

export function ContactStrip({
  nextRecipient,
}: Pick<CallAreaProps, "nextRecipient">) {
  if (!nextRecipient) return null;

  return (
    <div className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="font-Zilla-Slab text-lg font-bold text-foreground">
          {nextRecipient.contact?.firstname} {nextRecipient.contact?.surname}
        </div>
        <div className="text-lg text-foreground">
          {nextRecipient.contact?.phone}
        </div>
      </div>
      <div className="min-w-0 text-sm text-muted-foreground sm:text-right">
        <div className="truncate">{nextRecipient.contact?.email}</div>
        <div className="truncate">
          {nextRecipient.contact?.address
            ?.split(",")
            ?.map((part) => part.trim())
            .join(", ")}
        </div>
      </div>
    </div>
  );
}

type CallControlsProps = Pick<
  CallAreaProps,
  | "isBusy"
  | "nextRecipient"
  | "hangUp"
  | "handleVoiceDrop"
  | "handleDialNext"
  | "predictive"
  | "conference"
  | "voiceDrop"
  | "callState"
  | "isMicrophoneMuted"
  | "onToggleMute"
  | "onLoadQueue"
  | "onResetCall"
>;

/**
 * State-driven action area: exactly one primary action per call state.
 * In a call → Hang Up (with Audio Drop / mute as secondaries). Idle with an
 * empty queue → Load Queue. Idle with a loaded queue → Dial (power) or
 * Start/Start Dialing (predictive).
 */
export function CallControls({
  isBusy,
  nextRecipient,
  hangUp,
  handleVoiceDrop,
  handleDialNext,
  predictive,
  conference,
  voiceDrop,
  callState,
  isMicrophoneMuted,
  onToggleMute,
  onLoadQueue,
  onResetCall,
}: CallControlsProps) {
  const [confirmingHangUp, setConfirmingHangUp] = useState(false);
  const [dialArmed, setDialArmed] = useState(false);
  const confirmTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dialArmTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevShowInCallRef = useRef(false);

  /**
   * @effect Clean up the hang-up and dial-arm confirmation timers on unmount
   * so a stale timeout callback can't fire after the component is gone.
   * @effect-deps [] — fire-once cleanup, no external state to track
   * @effect-side-effects timer (clearTimeout on unmount)
   * @effect-why-not-loader Component lifecycle cleanup, not data fetching.
   */
  useEffect(() => () => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    if (dialArmTimerRef.current) clearTimeout(dialArmTimerRef.current);
  }, []);

  const handleHangUpClick = () => {
    if (confirmingHangUp) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingHangUp(false);
      hangUp();
    } else {
      setConfirmingHangUp(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingHangUp(false);
      }, 3000);
    }
  };

  const inCall = callState === "connected" || callState === "dialing";
  const showInCall = inCall && (!predictive || !!conference);

  /**
   * @effect Arm a "click again to dial" guard on the Dial button whenever it
   * replaces the Hang Up button (manual mode only). Prevents an agent's
   * in-flight click on Hang Up from becoming an accidental dial when the
   * recipient hangs up first and the button flips in the same spot
   * (see #1292). Predictive Start/Start Dialing is not click-replacing
   * anything, so it stays no-confirm.
   * @effect-deps [showInCall, predictive] — flip is only meaningful when
   * these two derived values change.
   * @effect-side-effects timer (arms + 3s auto-disarm)
   * @effect-why-not-loader Pure UI state, no data fetch.
   */
  useEffect(() => {
    if (prevShowInCallRef.current && !showInCall && !predictive) {
      if (dialArmTimerRef.current) clearTimeout(dialArmTimerRef.current);
      setDialArmed(true);
      dialArmTimerRef.current = setTimeout(() => {
        setDialArmed(false);
      }, 3000);
    }
    prevShowInCallRef.current = showInCall;
  }, [showInCall, predictive]);

  const handleDialClick = () => {
    if (dialArmed) {
      // First click after a just-ended call: consume as a "wake up" click and
      // disarm. The agent must click again — deliberately — to actually dial.
      if (dialArmTimerRef.current) clearTimeout(dialArmTimerRef.current);
      setDialArmed(false);
      return;
    }
    handleDialNext();
  };

  if (showInCall) {
    return (
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-1 gap-2">
          <Button
            onClick={handleHangUpClick}
            variant="destructive"
            className="flex-1 rounded-full"
          >
            {confirmingHangUp ? "Click again to hang up" : "Hang Up"}
          </Button>
          {voiceDrop ? (
            <Button
              onClick={handleVoiceDrop}
              className="flex-1 rounded-full bg-primary text-primary-foreground"
              disabled={callState !== "connected"}
            >
              Audio Drop
            </Button>
          ) : null}
          {onToggleMute ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={onToggleMute}
              aria-label={
                isMicrophoneMuted ? "Unmute microphone" : "Mute microphone"
              }
              aria-pressed={Boolean(isMicrophoneMuted)}
            >
              {isMicrophoneMuted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          ) : null}
        </div>
        {onResetCall ? (
          <button
            type="button"
            onClick={onResetCall}
            className="text-xs text-muted-foreground underline hover:text-foreground"
            data-testid="call-screen-reset-call"
          >
            Reset call
          </button>
        ) : null}
      </div>
    );
  }

  const needsQueue = !predictive && !nextRecipient;

  if (needsQueue) {
    return (
      <div className="flex flex-col gap-3 px-4 py-3">
        <Button
          onClick={onLoadQueue}
          disabled={isBusy || !onLoadQueue}
          className="w-full rounded-full"
          data-testid="call-screen-load-queue"
        >
          Load Queue
        </Button>
      </div>
    );
  }

  // When the Dial button first appears after a call ends (`dialArmed`), it
  // reads as "Click again to call back" — Sai's #1342 point 1: the button
  // that lands in the same spot the Hang Up used to occupy should evoke
  // "back to calling" so the agent knows *why* the label just changed.
  // Once the guard window elapses (see the arm effect above) the label
  // reverts to plain "Dial" for the next-contact flow, unchanged.
  const dialLabel = dialArmed
    ? "Click again to call back"
    : !predictive
      ? "Dial"
      : conference
        ? "Start"
        : "Start Dialing";

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <Button
        onClick={handleDialClick}
        disabled={isBusy}
        data-testid="call-screen-dial"
        className="w-full rounded-full bg-success text-success-foreground hover:bg-success/80"
        title={
          nextRecipient?.contact?.phone
            ? `Dial ${nextRecipient.contact.phone}`
            : undefined
        }
      >
        {dialLabel}
      </Button>
    </div>
  );
}

type DispositionBarProps = Pick<
  CallAreaProps,
  | "isBusy"
  | "questionContact"
  | "handleDequeueNext"
  | "disposition"
  | "dispositionOptions"
  | "setDisposition"
>;

export function DispositionBar({
  isBusy,
  questionContact,
  handleDequeueNext,
  disposition,
  dispositionOptions,
  setDisposition,
}: DispositionBarProps) {
  const hasValidDisposition =
    disposition !== "idle" &&
    dispositionOptions.some(
      (option) =>
        (typeof option === "string" ? option : option.value) === disposition,
    );

  return (
    <div className="flex gap-2 border-t bg-card px-4 py-3">
      <Select
        value={disposition}
        onValueChange={setDisposition}
        disabled={!questionContact}
      >
        <SelectTrigger
          data-testid="call-screen-disposition"
          className="min-w-0 flex-[3] rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <SelectValue placeholder="Select a disposition" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="idle">Select a disposition</SelectItem>
          {dispositionOptions?.map((option, index) => {
            const value = typeof option === "string" ? option : option.value;
            const label =
              typeof option === "string"
                ? formatDispositionLabel(option)
                : option.label;
            return (
              <SelectItem value={value} key={index}>
                {label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Button
        type="button"
        disabled={isBusy || !hasValidDisposition}
        onClick={handleDequeueNext}
        className="flex-1 rounded-full text-xs"
      >
        Save and Next
      </Button>
    </div>
  );
}

export const CallArea: React.FC<CallAreaProps> = ({
  isBusy,
  nextRecipient,
  questionContact,
  displayState,
  hangUp,
  handleVoiceDrop,
  handleDialNext,
  handleDequeueNext,
  setDisposition,
  disposition,
  predictive = false,
  conference = null,
  callState: state,
  callDuration,
  dispositionOptions,
  voiceDrop = false,
  isMicrophoneMuted,
  onToggleMute,
  onLoadQueue,
  onResetCall,
}: CallAreaProps) => {
  return (
    <div className={cn(callPanelShellClass, "min-h-0 justify-between")}>
      <StatusBar displayState={displayState} callDuration={callDuration} />
      <ContactStrip nextRecipient={nextRecipient} />
      <CallControls
        isBusy={isBusy}
        nextRecipient={nextRecipient}
        hangUp={hangUp}
        handleVoiceDrop={handleVoiceDrop}
        handleDialNext={handleDialNext}
        predictive={predictive}
        conference={conference}
        voiceDrop={voiceDrop}
        callState={state}
        isMicrophoneMuted={isMicrophoneMuted}
        onToggleMute={onToggleMute}
        onLoadQueue={onLoadQueue}
        onResetCall={onResetCall}
      />
      <DispositionBar
        isBusy={isBusy}
        questionContact={questionContact}
        handleDequeueNext={handleDequeueNext}
        disposition={disposition}
        dispositionOptions={dispositionOptions}
        setDisposition={setDisposition}
      />
    </div>
  );
};
