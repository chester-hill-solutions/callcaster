import { Tables } from "~/lib/database.types";
import { QueueItem } from "~/lib/types";
import { formatTime } from "~/lib/utils";
import { Button } from "./ui/button";

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
  dispositionOptions:any[];
  setDisposition: (disposition: string) => void;
  recentAttempt: Attempt | null;
  predictive: boolean;
  conference: Conference | null;
  voiceDrop:boolean;
  displayState: string;
  callState: string;
  callDuration: number
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
  voiceDrop = false
}:CallAreaProps) => {
  const handleHangUp = () => {
    hangUp();
  };
  const handleSetDisposition = (newDisposition: string) => {
    setDisposition(newDisposition);
  };

  return (
    <div
      style={{
        border: "3px solid #BCEBFF",
        flex: "1 1 20%",
        borderRadius: "20px",
        backgroundColor: "hsl(var(--card))",
        minHeight: "300px",
        alignItems: "stretch",
        flexDirection: "column",
        justifyContent: "space-between",
        display: "flex",
        boxShadow: "3px 5px 0  rgba(50,50,50,.6)",
      }}
    >
      <div className="flex flex-1 flex-col">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTopLeftRadius: "18px",
            borderTopRightRadius: "18px",
            padding: "16px",
            marginBottom: "8px",
            background:
              displayState === "failed"
                ? "hsl(var(--primary))"
                : displayState === "connected" || displayState === "dialing"
                  ? "#4CA83D"
                  : "#333333",
          }}
          className={`font-Tabac-Slab text-xl text-white ${state === "connected" || state === "dialing" ? "bg-green-300" : "bg-slate-700"}`}
        >
          <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
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
        </div>
        {!conference && predictive && state === "idle" && (
          <div className="flex h-full flex-1 justify-center align-middle">
            <Button
              disabled={isBusy}
              onClick={handleDialNext}
              className="self-center rounded-lg bg-primary px-4 py-2 font-Zilla-Slab text-xl text-white"
            >
              Start Dialing
            </Button>
          </div>
        )}
        {nextRecipient && (
          <div className="flex justify-between p-4">
            <div className="flex flex-col">
              <div className="font-Zilla-Slab text-lg font-bold">
                {nextRecipient.contact?.firstname}{" "}
                {nextRecipient.contact?.surname}
              </div>
              <div className="text-lg">{nextRecipient.contact?.phone}</div>
              <div>{nextRecipient.contact?.email}</div>
              <div>
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
          <div
            className="flex flex-1 gap-2 px-4 py-2"
            style={{ position: "relative" }}
          >
            <Button
              onClick={handleHangUp}
              style={{
                flex: "1",
                padding: "4px 8px",
                background: "#d60000",
                borderRadius: "20px",
                color: "white",
              }}
              disabled={state !== "connected" && state !== "dialing"}
            >
              Hang Up
            </Button>
           {voiceDrop && <Button
              onClick={handleVoiceDrop}
              style={{
                flex: "1",
                padding: "4px 8px",
                background: "#2288d8",
                borderRadius: "20px",
                color: "white",
              }}
             disabled={state !== "connected"}
            >
              Audio Drop
            </Button>}
            <Button
              onClick={handleDialNext}
              disabled={
                displayState === "dialing" ||
                displayState === "connected" ||
                isBusy ||
                (!predictive && !nextRecipient)
              }
              style={{
                flex: "1",
                padding: "4px 8px",
                background: "#4CA83D",
                borderRadius: "20px",
                color: "white",
              }}
              title={
                state === "connected" || state === "dialing" || !nextRecipient
                  ? "Load your queue to get started"
                  : `Dial ${nextRecipient?.contact?.phone}`
              }
            >
              {!predictive ? "Dial" : "Start"}
            </Button>
          </div>
          <div className="flex gap-2 px-4" style={{ paddingBottom: ".5rem" }}>
            <select
              disabled={!nextRecipient}
              onChange={(e) => handleSetDisposition(e.currentTarget.value)}
              value={disposition}
              style={{
                flex: "1 1 75%",
                padding: "4px 8px",
                border: "1px solid #333",
                borderRadius: "20px",
                color: "#333",
              }}
            >
              <option value="idle">Select a disposition</option>
              {dispositionOptions?.map(({ value, label }, i) => (
                <option value={value} key={i}>
                  {label}
                </option>
              ))}
            </select>
            <button
              disabled={isBusy || disposition === "idle"}
              onClick={() => handleDequeueNext()}
              style={{
                flex: "1 1 25%",
                padding: "4px 8px",
                border: "1px solid #4CA83D",
                fontSize: "10px",
                borderRadius: "20px",
                color: "#333",
                opacity:
                  state === "connected" || state === "dialing" || !nextRecipient
                    ? ".6"
                    : "unset",
              }}
            >
              Save and Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
