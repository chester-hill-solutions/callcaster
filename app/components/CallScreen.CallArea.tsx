import React, { useEffect } from 'react';
import { useCallState } from '~/hooks/useCallState';
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

const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const CallArea: React.FC<CallAreaProps> = ({
  nextRecipient,
  activeCall,
  recentCall,
  hangUp,
  handleDialNext,
  handleDequeueNext,
  disposition,
  setDisposition,
  recentAttempt,
  predictive = false,
  conference = null,
}) => {
  const { state, context, send } = useCallState();

  useEffect(() => {
    if (activeCall?.parameters?.CallSid && !recentAttempt?.answered_at) {
      send({ type: 'START_DIALING' });
    }
    if (recentAttempt?.answered_at) {
      send({ type: 'CONNECT' });
    }
    if (recentAttempt?.disposition === 'failed' || recentAttempt?.result?.status === 'failed') {
      send({ type: 'FAIL' });
    }
  }, [activeCall, recentAttempt, send]);

  const handleHangUp = () => {
    hangUp();
    send({ type: 'HANG_UP' });
  };

  const handleSetDisposition = (newDisposition: string) => {
    setDisposition(newDisposition);
    send({ type: 'SET_DISPOSITION', disposition: newDisposition });
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
            background: state === 'failed'
              ? "hsl(var(--primary))"
              : state === 'connected' || state === 'dialing'
                ? "#4CA83D"
                : "#333333",
          }}
          className={`font-Tabac-Slab text-xl text-white ${state === 'connected' || state === 'dialing' ? "bg-green-300" : "bg-slate-700"}`}
        >
          <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
            {state === 'failed' && <div>Call Failed</div>}
            {state === 'connected' && (
              <div>
                Connected {formatTime(context.callDuration * 1000)}
              </div>
            )}
            {state === 'dialing' && <div>Dialing...</div>}
            {state === 'completed' && <div>Complete</div>}
            {state === 'idle' && <div>Pending</div>}
          </div>
        </div>
        {!conference && predictive && state === 'idle' && (
          <div className="flex h-full flex-1 justify-center align-middle">
            <button
              onClick={handleDialNext}
              className="self-center bg-primary px-4 py-2 font-Zilla-Slab text-xl text-white"
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
              onClick={handleHangUp}
              style={{
                flex: "1",
                padding: "4px 8px",
                background: "#d60000",
                borderRadius: "5px",
                color: "white",
                opacity: state !== 'connected' && state !== 'dialing' ? ".6" : "unset",
              }}
              disabled={state !== 'connected' && state !== 'dialing'}
            >
              Hang Up
            </button>
            {nextRecipient?.contact &&
              !nextRecipient?.contact?.phone &&
              predictive && (
                <button
                  onClick={handleDequeueNext}
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
                onClick={handleDialNext}
                disabled={state === 'connected' || state === 'dialing'}
                style={{
                  flex: "1",
                  padding: "4px 8px",
                  background: "#4CA83D",
                  borderRadius: "5px",
                  color: "white",
                  opacity: state === 'connected' || state === 'dialing' ? ".6" : "unset",
                }}
              >
                {!predictive ? "Dial" : "Start"}
              </button>
            }
          </div>
          {(state === 'completed' || state === 'failed') && !predictive && (
            <div className="flex px-4" style={{ paddingBottom: ".5rem" }}>
              <button
                onClick={handleDequeueNext}
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