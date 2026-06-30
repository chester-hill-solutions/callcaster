import { Tables } from "@/lib/db-types";
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
import {
  callPanelShellClass,
} from "@/components/call/call-panel-classes";

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

interface CallAreaProps {
  isBusy: boolean;
  nextRecipient: QueueItem | null;
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

export const CallArea: React.FC<CallAreaProps> = ({
  isBusy,
  nextRecipient,
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
}: CallAreaProps) => {
  const handleHangUp = () => {
    hangUp();
  };
  const handleSetDisposition = (newDisposition: string) => {
    setDisposition(newDisposition);
  };

  return (
    <div className={cn(callPanelShellClass, "justify-between")}>
      <div className="flex flex-1 flex-col">
        <div
          className={cn(
            "mb-2 flex items-center justify-center rounded-t-[14px] px-4 py-3 font-Tabac-Slab text-xl text-white",
            statusBarClass(displayState),
          )}
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
        {!conference && predictive && state === "idle" && (
          <div className="flex h-full flex-1 justify-center align-middle">
            <Button
              disabled={isBusy}
              onClick={handleDialNext}
              className="self-center rounded-lg bg-primary px-4 py-2 font-Zilla-Slab text-xl text-primary-foreground"
            >
              Start Dialing
            </Button>
          </div>
        )}
        {nextRecipient && (
          <div className="flex justify-between p-4">
            <div className="flex flex-col">
              <div className="font-Zilla-Slab text-lg font-bold text-foreground">
                {nextRecipient.contact?.firstname}{" "}
                {nextRecipient.contact?.surname}
              </div>
              <div className="text-lg text-foreground">
                {nextRecipient.contact?.phone}
              </div>
              <div className="text-muted-foreground">
                {nextRecipient.contact?.email}
              </div>
              <div className="text-muted-foreground">
                {nextRecipient.contact?.address
                  ?.split(",")
                  ?.map((t) => t.trim())
                  .join(", ")}
              </div>
            </div>
          </div>
        )}
      </div>
      <div>
        <div className="flex flex-col">
          <div className="relative flex flex-1 gap-2 px-4 py-2">
            <Button
              onClick={handleHangUp}
              variant="destructive"
              className="flex-1 rounded-full"
              disabled={state !== "connected" && state !== "dialing"}
            >
              Hang Up
            </Button>
            {voiceDrop ? (
              <Button
                onClick={handleVoiceDrop}
                className="flex-1 rounded-full bg-primary text-primary-foreground"
                disabled={state !== "connected"}
              >
                Audio Drop
              </Button>
            ) : null}
            <Button
              onClick={handleDialNext}
              disabled={
                displayState === "dialing" ||
                displayState === "connected" ||
                isBusy ||
                (!predictive && !nextRecipient)
              }
              data-testid="call-screen-dial"
              className="flex-1 rounded-full bg-success text-success-foreground hover:bg-success/80"
              title={
                state === "connected" || state === "dialing" || !nextRecipient
                  ? "Load your queue to get started"
                  : `Dial ${nextRecipient?.contact?.phone}`
              }
            >
              {!predictive ? "Dial" : "Start"}
            </Button>
          </div>
          <div className="flex gap-2 px-4 pb-2">
            <Select
              value={disposition}
              onValueChange={handleSetDisposition}
              disabled={!nextRecipient}
            >
              <SelectTrigger
                data-testid="call-screen-disposition"
                className="min-w-0 flex-[3] rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <SelectValue placeholder="Select a disposition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="idle">Select a disposition</SelectItem>
                {dispositionOptions?.map((option, i) => {
                  const value =
                    typeof option === "string" ? option : option.value;
                  const label =
                    typeof option === "string" ? option : option.label;
                  return (
                    <SelectItem value={value} key={i}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy || disposition === "idle"}
              onClick={() => handleDequeueNext()}
              className="flex-1 rounded-full text-xs"
            >
              Save and Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
