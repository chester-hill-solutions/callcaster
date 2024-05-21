import { useFetcher, useOutletContext } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { useSupabaseRealtime } from "../../hooks/useSupabaseRealtime";
import CallContact from "./CallContact/CallContact";
import { TableHeader } from "./TableHeader";
import { NewContactForm } from "./NewContactForm";
import HouseholdContact from "./HouseholdContact";

export default function CallList({ contacts = [], calls = [], placeCall, hangUp, activeCall, incomingCall, contactOpen, newContact, handleContact, audiences = [], openContact, campaign, status }) {
    const { supabase } = useOutletContext();
    const [contactList, setContacts] = useSupabaseRealtime('contact', supabase, contacts);

    const householdMap = contactList.reduce((acc, curr) => {
        if (!acc[curr.address]) {
            acc[curr.address] = [];
        }
        acc[curr.address].push(curr);
        acc[curr.address].sort((a, b) => a?.phone?.localeCompare(b?.phone));
        return acc;
    }, {});

    const [callsList, setCallsList] = useSupabaseRealtime('call', supabase, calls);
    const [showUpdate, setShowUpdate] = useState(null);
    const [autoDial, setAutoDial] = useState(false);
    const [groupByHousehold, setGroupByHousehold] = useState(true);
    const [timer, setTimer] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);
    const fetcher = useFetcher();
    const currentContactIndex = useRef(0);

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

    const dialNextContact = () => {
        if (activeCall || incomingCall || status !== 'Registered') {
            return;
        }

        if (groupByHousehold) {
            const households = Object.values(householdMap);
            for (let i = currentContactIndex.current; i < households.length; i++) {
                const household = households[i];

                for (let j = 0; j < household.length; j++) {
                    const contact = household[j];
                    const recentCall = callsList ? callsList.find((call) => call.contact_id === contact.id) : null;
                    if (!recentCall && contact.phone && j === 0) {
                        handleCall(contact);
                        currentContactIndex.current = (i + 1) % households.length;
                        return;
                    }
                }
            }
        } else {
            for (let i = currentContactIndex.current; i < contactList.length; i++) {
                const contact = contactList[i];
                const recentCall = callsList ? callsList.find((call) => call.contact_id === contact.id) : null;
                if (!recentCall && contact.phone) {
                    handleCall(contact);
                    currentContactIndex.current = (i + 1) % contactList.length;
                    return;
                }
            }
        }

        // Reset to start if we reach the end without finding a contact
        currentContactIndex.current = 0;
    };

    const startAutoDial = () => {
        setAutoDial(true);
        setTimer(10);
    };

    const stopAutoDial = () => {
        setAutoDial(false);
        setTimer(0);
    };

    const toggleAutoDial = () => {
        if (autoDial) {
            stopAutoDial();
        } else {
            startAutoDial();
        }
    };
    useEffect(() => {
        if (autoDial && timer === 0 && !activeCall&& status == 'Registered') {
            setTimer(10)
            dialNextContact();
        }
        if (timer > 0 && !activeCall && status == 'Registered') {
            setTimeout(() => {
                setTimer((prev) => prev - 1)
            }, 1000)
        }
    }, [autoDial, timer, activeCall, status]);

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
        <div style={{ display: "flex", flexDirection: "column" }}>
            <div className="row flex justify-space-between" style={{ padding: '16px 0' }}>
                <div></div>
                <div className="flex row gap2">
                    <button disabled style={{ padding: "8px 16px", background: "#d60000", borderRadius: "5px", color: 'white' }}>
                        Predictive Dial
                    </button>
                    <button onClick={toggleAutoDial} style={{ padding: "8px 16px", border: "1px solid #d60000", borderRadius: "5px" }}>
                        {autoDial ? 'Stop AutoDial' : 'Start AutoDial'}
                    </button>
                    {autoDial && !activeCall && status === 'Registered' && (
                        <div style={{ padding: "8px 16px", background: "#f7f7f7", borderRadius: "5px" }}>
                            Next call in: {timer}s
                        </div>
                    )}
                </div>
            </div>
            <div className="flex column">
                <table style={{ width: "100%", borderCollapse: "collapse", background: "rgba(240,240,240,1)", color: '#333', border: "2px solid #333" }}>
                    <TableHeader keys={["Name", "Number", "Address", "Status", "", "Updates"]} />
                    <tbody>
                        {groupByHousehold ?
                            Object.values(householdMap).map((household, index) => (
                                <HouseholdContact
                                    key={index}
                                    household={household}
                                    callsList={callsList}
                                    handleReplay={handleReplay}
                                    handlePause={handlePause}
                                    handleCall={handleCall}
                                    isPlaying={isPlaying}
                                    showUpdate={showUpdate}
                                    handleShowUpdate={handleShowUpdate}
                                    questions={campaign.call_questions}
                                />
                            )) :
                            contactList.map((contact) => (
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
