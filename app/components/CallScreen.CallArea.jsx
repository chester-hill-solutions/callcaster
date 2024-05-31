import { useEffect, useState } from "react"

const CallArea = ({ nextRecipient, activeCall, callStarted, recentCall }) => {

    const formatTime = (milliseconds) => {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    return (
        <div style={{ flex: '1 0 20%', border: '3px solid #BCEBFF', borderRadius: "20px", marginBottom: "2rem" }}>
            <div style={{
                display: 'flex',
                alignItems: "center",
                justifyContent: 'space-between',
                borderTopLeftRadius: '18px',
                borderTopRightRadius: '18px',
                padding: "8px",
                marginBottom: "10px"
            }}>
                <div >
                    {activeCall && recentCall ? `Connected ${formatTime(Date.now() - (new Date(recentCall.date_created)).getTime())}` : 'Pending' }
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: "center", justifyContent: 'space-between', border: '1px solid #ccc', borderRadius: '5px', padding: "8px", marginBottom: "10px" }}>
                <div >
                    <strong>Next Recipient: </strong> {nextRecipient.firstname} {nextRecipient.surname} ({nextRecipient.phone})
                </div>
            </div>
        </div>
    )
}
export { CallArea }