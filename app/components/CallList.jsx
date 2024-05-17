import { useFetcher, useOutletContext } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import CallContact from "./CallList/CallContact";
import { TableHeader } from "./CallList/TableHeader";
import { NewContactForm } from "./CallList/NewContactForm";
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";

export default function CallList({
    contacts = [],
    calls = [],
    placeCall,
    hangUp,
    activeCall,
    incomingCall,
    contactOpen,
    newContact,
    handleContact,
    handleAudienceChange,
    audiences = [],
    openContact,
    campaign
}) {
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
        <div className="flex flex-col p-4 bg-white rounded-lg shadow">
            <div className="flex justify-between items-center py-2">
                <button className="btn-outline" onClick={autoDial}>AutoDial</button>
                <button className="btn-disabled">Predictive Dial</button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white text-gray-900">
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
            </div>
            {contactOpen && (
                <NewContactForm {...{ fetcher, openContact, handleContact, newContact, handleAudienceChange, audiences }} />
            )}
        </div>
    );
}
