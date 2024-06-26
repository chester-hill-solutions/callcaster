/* eslint-disable jsx-a11y/mouse-events-have-key-events */
import { useEffect, useState } from "react";
import { ClearIcon } from "./Icons";
import { useNavigation } from "@remix-run/react";
const CallArea = ({ nextRecipient, activeCall = null, recentCall = {}, hangUp, handleDialNext, handleDequeueNext, disposition, setDisposition, recentAttempt, predictive = false, conference = null }) => {
    const [time, setTime] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const nav = useNavigation();
    const isBusy = (nav.state !== 'idle')
    const isFailed = recentAttempt.disposition === 'failed';
    const isDialing = activeCall?.parameters?.CallSid && !(recentAttempt.answered_at)
    const isConnected = recentAttempt.answered_at && activeCall?.parameters?.CallSid
    const isComplete = (recentAttempt.disposition || recentAttempt.result?.status)
    const isPending = (!(recentAttempt.disposition || recentAttempt.result?.status)) && !activeCall?.parameters?.CallSid;
    
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
        if (recentCall.date_created && activeCall?.parameters?.CallSid) setTime(recentCall.date_created)
    }, [activeCall?.parameters?.CallSid, nextRecipient, recentCall])

    const formatTime = (milliseconds) => {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    return (
        <div style={{
            border: '3px solid #BCEBFF',
            borderRadius: "20px",
            marginBottom: "2rem",
            backgroundColor: 'hsl(var(--card))',
            minHeight: "300px",
            alignItems: "stretch",
            flexDirection: "column",
            justifyContent: "space-between",
            display: "flex",
            boxShadow: "3px 5px 0  rgba(50,50,50,.6)"
        }}>
            <div className="flex flex-col flex-1">
                <div style={{
                    display: 'flex',
                    alignItems: "center",
                    justifyContent: 'space-between',
                    borderTopLeftRadius: '18px',
                    borderTopRightRadius: '18px',
                    padding: "16px",
                    marginBottom: "8px",
                    background: isFailed ? "hsl(var(--primary))" : activeCall?.parameters?.CallSid ? "#4CA83D" :  "#333333"
                }}
                    className={`font-Tabac-Slab text-xl text-white ${activeCall ? 'bg-green-300' : 'bg-slate-700'}`}
                >
                    <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
                        {isFailed ? <div>Call Failed</div>:
                        isConnected ? <div>Connected {`${formatTime(time - (new Date(recentAttempt.answered_at)))}`}</div>:
                        isDialing ? <div>Dialing...</div>:
                        isComplete ? <div>Complete</div>:
                        isPending && <div>Pending</div>}
                    </div>
                </div>
                {!conference && predictive &&
                    <div className="h-full flex justify-center align-middle flex-1">
                        <button disabled={(isBusy || isConnected)} onClick={() => handleDialNext()} className="px-4 py-2 bg-primary text-xl font-Zilla-Slab text-white self-center" style={{ opacity: (isBusy || isConnected) ? '.7' : 'unset' }}>
                            Start Dialing
                        </button>
                    </div>
                }
                {nextRecipient &&
                    <div className="p-4 flex justify-between">
                        <div className="flex flex-col">
                            <div className="font-bold text-lg font-Zilla-Slab">
                                {nextRecipient.contact?.firstname} {nextRecipient.contact?.surname}
                            </div>
                            <div className="text-lg">
                                {nextRecipient.contact?.phone}
                            </div>
                            <div >
                                {nextRecipient.contact?.email}
                            </div>
                            <div >
                                {nextRecipient.contact?.address?.split(',')?.map((t) => t.trim()).join(', ')}

                            </div>
                        </div>
                    </div>
                }
            </div>
            <div>
                <div className="flex flex-col">
                    <div className="flex gap-2 px-4 py-2 flex-1" style={{ position: 'relative' }}>
                        <button disabled={isBusy} onClick={() => hangUp()} style={{ flex: "1", padding: "4px 8px", background: "#d60000", borderRadius: "5px", color: 'white', opacity: (isBusy || !(isConnected || isDialing)) ? '.6' : 'unset' }}>
                            Hang Up
                        </button>
                        {nextRecipient?.contact && !nextRecipient?.contact?.phone && predictive &&
                            (<button disabled={isBusy} onClick={() => handleDequeueNext()} style={{ flex: "1", padding: "4px 8px", border: "1px solid #333", borderRadius: "5px", color: "#333" }}>
                                Next
                            </button>)
                        }
                        {<button onClick={() => handleDialNext()} disabled={(isBusy || isConnected || isDialing)} style={{ flex: "1", padding: "4px 8px", background: "#4CA83D", borderRadius: "5px", color: "white", opacity: (isBusy || isConnected || isDialing) ? '.6' : 'unset' }}>
                            {!predictive ? 'Dial' : 'Start'}
                        </button>}
                    </div>
                    {(isComplete || isFailed) && !predictive && (
                        <div className="flex px-4" style={{ paddingBottom: ".5rem" }}>
                            <button disabled={isBusy} onClick={() => handleDequeueNext()} style={{ flex: "1", padding: "4px 8px", border: "1px solid #333", borderRadius: "5px", color: "#333" }}>
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
export { CallArea }