import { useEffect, useState } from "react";
const CallArea = ({ nextRecipient, activeCall = null, recentCall = {}, hangUp, handleDialNext, handleDequeueNext, disposition, setDisposition, recentAttempt }) => {
    const [time, setTime] = useState(Date.now());

    useEffect(() => {
        if (activeCall) {
            const tick = () => {
                setTime(new Date());
            };
            const intervalId = setInterval(tick, 100);
            return () => {
                clearInterval(intervalId);
            };
        }
    }, [activeCall]);

    const formatTime = (milliseconds) => {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };
    return (
        <div style={{ flex: '0 0 20%', border: '3px solid #BCEBFF', borderRadius: "20px", marginBottom: "2rem", background: '#F1F1F1' }}>
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
                    {activeCall ?
                     
                    `Connected ${formatTime(time - (new Date(recentCall?.date_created)).getTime())}` : 
                    recentCall?.sid ? `Complete` 
                    : 
                    'Pending'}
                </div>
            </div>
            {nextRecipient &&
                <div className="p-4   w-3/4">
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
                        {nextRecipient.contact?.address?.split(',').map((t) => t.trim()).join(', ')}
                    </div>
                </div>

            }
            <div>
                <div className="flex row gap-2 px-4 py-2 flex-1">
                    <button onClick={() => hangUp()} disabled={!activeCall} style={{ padding: "8px 16px", background: "#d60000", borderRadius: "5px", color: 'white', width: "100px" }}>
                        End Call
                    </button>
                    {!recentAttempt?.call?.length ? <button onClick={() => handleDialNext()} disabled={activeCall} style={{ padding: "8px 16px", background: "#4CA83D", borderRadius: "5px", width: "100px", color: "white" }}>
                        Dial
                    </button> :
                        <button disabled={!recentAttempt?.call?.length} onClick={() => handleDequeueNext()} style={{ padding: "8px 16px", border: "1px solid #333", borderRadius: "5px", width: "100px", color: "#333" }}>
                            Next
                        </button>}
                </div>

            </div>
        </div>
    )
}
export { CallArea }