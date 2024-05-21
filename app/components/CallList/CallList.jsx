import { useFetcher, useOutletContext } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { useSupabaseRealtime } from "../../hooks/useSupabaseRealtime";
import CallContact from "./CallContact/CallContact";
import { TableHeader } from "./TableHeader";
import { NewContactForm } from "./NewContactForm";

export default function CallList({ contacts = [], calls = [], placeCall, hangUp, activeCall, incomingCall, contactOpen, newContact, handleContact, audiences = [], openContact, campaign }) {
    const { supabase } = useOutletContext();
    const [contactList, setContacts] = useSupabaseRealtime('contact', supabase, contacts);
    const [callsList, setCallsList] = useSupabaseRealtime('call', supabase, calls);
    const [showUpdate, setShowUpdate] = useState(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);
    const fetcher = useFetcher();

    const handleReplay = (url) => {
        fetcher.load(`/api/recording?url=${encodeURIComponent(url)}`);
    };

    const handlePause = () => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        setIsPlaying(false);
    };

    const handleCall = (contact) => {
        if (activeCall || incomingCall) {
            hangUp();
        } else {
            placeCall(contact);
            setShowUpdate(contact.id);
        }
    };

    const handleShowUpdate = (id) => {
        setShowUpdate((curr) => (curr === id ? null : id));
    };

    const autoDial = () => {
        if (activeCall || incomingCall) return;
        for (let i = 0; i < contactList.length; i++) {
            const contact = contactList[i];
            const recentCall = callsList ? callsList.find((call) => call.contact_id === contact.id) : null;
            if (!recentCall) {
                handleCall(contact);
                break;
            }
        }
    };

    useEffect(() => {
        if (fetcher.data && fetcher.data.body && !isPlaying) {
            const audioUrl = URL.createObjectURL(new Blob([fetcher.data.body], { type: fetcher.data.headers['Content-Type'] }));
            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            audio.play();
            setIsPlaying(true);

            audio.addEventListener('ended', () => {
                setIsPlaying(false);
            });
        }
    }, [fetcher.data, isPlaying]);

    return (
        <div style={{}} className="flex column">
            <div className="row flex justify-space-between" style={{ padding: '16px 0' }}>
                <div></div>
                <div className="flex row gap2">
                    <button onClick={autoDial} style={{ padding: "8px 16px", border: "1px solid #d60000", borderRadius: "5px" }}>
                        AutoDial
                    </button>
                    <button disabled style={{ padding: "8px 16px", background: "#d60000", borderRadius: "5px", color: 'white' }}>
                        Predictive Dial
                    </button>
                </div>
            </div>
            <div className="flex column">
                <table style={{ width: "100%", borderCollapse: "collapse", background: "rgba(240,240,240,1)", color: '#333', border: "2px solid #333" }}>
                    <TableHeader keys={["Name", "Number", "Address", "Status", "", "Updates"]} />
                    <tbody>
                        {contactList.map((contact) => (
                            <CallContact
                                key={contact.id}
                                contact={contact}
                                callsList={callsList}
                                handleReplay={handleReplay}
                                handlePause={handlePause}
                                handleCall={handleCall}
                                isPlaying={isPlaying}
                                showUpdate={showUpdate}
                                handleShowUpdate={handleShowUpdate}
                                questions={campaign.call_questions}
                            />
                        ))}
                    </tbody>
                </table>
                {contactOpen && (
                    <NewContactForm {...{ fetcher, openContact, handleContact, newContact, audiences }} />
                )}
            </div>
        </div>
    );
}