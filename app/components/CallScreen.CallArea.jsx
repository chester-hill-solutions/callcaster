/* eslint-disable jsx-a11y/mouse-events-have-key-events */
import { useEffect, useState } from "react";
import { ClearIcon } from "./Icons";
const CallArea = ({ nextRecipient, activeCall = null, recentCall = {}, hangUp, handleDialNext, handleDequeueNext, disposition, setDisposition, recentAttempt, predictive = false, conference = null }) => {
    const [time, setTime] = useState(null);
    const [tooltip, setTooltip] = useState(null);

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
        if (recentCall.date_created) setTime(recentCall.date_created)
    }, [nextRecipient, recentCall])

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
            background: '#F1F1F1',
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
                    background: activeCall ? "#4CA83D" : "#333333"
                }}
                    className={`font-Tabac-Slab text-xl text-white ${activeCall ? 'bg-green-300' : 'bg-slate-700'}`}
                >
                    <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>

                        {recentAttempt.answered_at && activeCall && <div>Connected {`${formatTime(time - (new Date(recentAttempt.answered_at)))}`}</div>}
                        {activeCall && !nextRecipient.id && <div>Searching for a call...</div>}
                        {activeCall && nextRecipient.id && !(recentAttempt) && <div>Dialing...</div>}
                        {!activeCall && <div>Pending</div>}
                    </div>
                </div>
                {!conference && 
                    <div className="h-full flex justify-center align-middle flex-1">
                        <button onClick={() => handleDialNext()} className="px-4 py-2 bg-primary text-xl font-Zilla-Slab text-white self-center">
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
                        <button onClick={() => hangUp()} disabled={!activeCall} style={{ flex: "1", padding: "4px 8px", background: activeCall ? "#d60000" : '#cc8888', borderRadius: "5px", color: 'white' }}>
                            Hang Up
                        </button>
                        {nextRecipient?.contact && !nextRecipient?.contact?.phone && predictive &&
                            (<button onClick={() => handleDequeueNext()} style={{ flex: "1", padding: "4px 8px", border: "1px solid #333", borderRadius: "5px", color: "#333" }}>
                                Next
                            </button>)
                        }
                        {<button onClick={() => handleDialNext()} disabled={activeCall} style={{ flex: "1", padding: "4px 8px", background: "#4CA83D", borderRadius: "5px", color: "white" }}>
                            {!predictive ? 'Dial' : 'Start'}
                        </button>}
                    </div>
                    {recentAttempt?.result?.status && (
                        <div className="flex px-4" style={{ paddingBottom: ".5rem" }}>
                            <button onClick={() => handleDequeueNext()} style={{ flex: "1", padding: "4px 8px", border: "1px solid #333", borderRadius: "5px", color: "#333" }}>
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