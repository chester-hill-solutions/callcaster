import { useEffect, useState } from "react";
import { ClearIcon } from "./Icons";
import { useNavigation } from "@remix-run/react";
import { Tables } from "~/lib/database.types";

type Contact = Tables<"contact">;
type Attempt = Tables<"outreach_attempt">;
type Call = Tables<"call">;

interface NextRecipient {
  contact: Contact;
  id: number;
}

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
  nextRecipient: NextRecipient | null;
  activeCall: ActiveCall | null;
  recentCall: Call | null;
  hangUp: () => void;
  handleDialNext: () => void;
  handleDequeueNext: () => void;
  disposition: string;
  setDisposition: (disposition: string) => void;
  recentAttempt: Attempt | null;
  predictive: boolean;
  conference: Conference | null;
}

const CallArea = ({
  nextRecipient,
  activeCall = null,
  recentCall = null,
  hangUp,
  handleDialNext,
  handleDequeueNext,
  disposition,
  setDisposition,
  recentAttempt,
  predictive = false,
  conference = null,
}: CallAreaProps) => {
  const [time, setTime] = useState<Date | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const nav = useNavigation();
  const isBusy = nav.state !== "idle";
  const isFailed = recentAttempt?.disposition === "failed";
  const isDialing =
    activeCall?.parameters?.CallSid && !recentAttempt?.answered_at;
  const isConnected =
    recentAttempt?.answered_at && activeCall?.parameters?.CallSid;
  const isComplete = !!(
    recentAttempt?.disposition || recentAttempt?.result?.status
  );
  const isPending =
    !recentAttempt?.disposition &&
    !recentAttempt?.result?.status &&
    !activeCall?.parameters?.CallSid;

  useEffect(() => {
    if (recentAttempt?.answered_at) {
      const tick = () => {
        setTime(new Date());
      };
      const intervalId = setInterval(tick, 100);
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [recentAttempt]);

  useEffect(() => {
    if (recentCall?.date_created && activeCall?.parameters?.CallSid) {
      setTime(new Date(recentCall.date_created));
    }
  }, [activeCall?.parameters?.CallSid, nextRecipient, recentCall]);

  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        border: "3px solid #BCEBFF",
        borderRadius: "20px",
        marginBottom: "2rem",
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
            background: isFailed
              ? "hsl(var(--primary))"
              : activeCall?.parameters?.CallSid
                ? "#4CA83D"
                : "#333333",
          }}
          className={`font-Tabac-Slab text-xl text-white ${activeCall ? "bg-green-300" : "bg-slate-700"}`}
        >
          <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
            {isFailed ? (
              <div>Call Failed</div>
            ) : isConnected ? (
              <div>
                Connected{" "}
                {`${formatTime(time?.getTime() - new Date(recentAttempt.answered_at).getTime())}`}
              </div>
            ) : isDialing ? (
              <div>Dialing...</div>
            ) : isComplete ? (
              <div>Complete</div>
            ) : (
              isPending && <div>Pending</div>
            )}
          </div>
        </div>
        {!conference && predictive && (
          <div className="flex h-full flex-1 justify-center align-middle">
            <button
              disabled={isBusy || !!isConnected}
              onClick={() => handleDialNext()}
              className="self-center bg-primary px-4 py-2 font-Zilla-Slab text-xl text-white"
              style={{ opacity: isBusy || isConnected ? ".7" : "unset" }}
            >
              Start Dialing
            </button>
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
            <button
              disabled={isBusy}
              onClick={() => hangUp()}
              style={{
                flex: "1",
                padding: "4px 8px",
                background: "#d60000",
                borderRadius: "5px",
                color: "white",
                opacity: isBusy || !(isConnected || isDialing) ? ".6" : "unset",
              }}
            >
              Hang Up
            </button>
            {nextRecipient?.contact &&
              !nextRecipient?.contact?.phone &&
              predictive && (
                <button
                  disabled={isBusy}
                  onClick={() => handleDequeueNext()}
                  style={{
                    flex: "1",
                    padding: "4px 8px",
                    border: "1px solid #333",
                    borderRadius: "5px",
                    color: "#333",
                  }}
                >
                  Next
                </button>
              )}
            {
              <button
                onClick={() => handleDialNext()}
                disabled={isBusy || isConnected || isDialing}
                style={{
                  flex: "1",
                  padding: "4px 8px",
                  background: "#4CA83D",
                  borderRadius: "5px",
                  color: "white",
                  opacity: isBusy || isConnected || isDialing ? ".6" : "unset",
                }}
              >
                {!predictive ? "Dial" : "Start"}
              </button>
            }
          </div>
          {(isComplete || isFailed) && !predictive && (
            <div className="flex px-4" style={{ paddingBottom: ".5rem" }}>
              <button
                disabled={isBusy}
                onClick={() => handleDequeueNext()}
                style={{
                  flex: "1",
                  padding: "4px 8px",
                  border: "1px solid #333",
                  borderRadius: "5px",
                  color: "#333",
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export { CallArea };
