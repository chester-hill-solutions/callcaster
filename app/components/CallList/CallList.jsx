import { useFetcher, useOutletContext } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { useSupabaseRealtime } from "../../hooks/useSupabaseRealtime";
import CallContact from "./CallContact/CallContact";
import { TableHeader } from "./TableHeader";
import { NewContactForm } from "./NewContactForm";

export default function CallList({ contacts = [], calls = [], placeCall, hangUp, device, activeCall, incomingCall, contactOpen, newContact, handleContact, audiences = [], openContact, campaign, status }) {
    const { supabase } = useOutletContext();
    const [contactList] = useSupabaseRealtime('contact', supabase, contacts);

    const householdMap = contactList.reduce((acc, curr) => {
        if (!acc[curr.address]) {
            acc[curr.address] = [];
        }
        acc[curr.address].push(curr);
        acc[curr.address].sort((a, b) => a?.phone?.localeCompare(b?.phone));
        return acc;
    }, {});

    const [callsList] = useSupabaseRealtime('call', supabase, calls);
    const [showUpdate, setShowUpdate] = useState(null);
    const [groupByHousehold] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);
    const fetcher = useFetcher();
    const currentContactIndex = useRef(0);
    const openRef = useRef(null);
    const [nextRecipient, setNextRecipient] = useState(null);

    const nextNumber = (skip = false) => {
        let foundNext = false;
        let nextContact = null;
        let currentIndex = currentContactIndex.current;

        if (skip) {
            if (groupByHousehold) {
                const households = Object.values(householdMap);
                currentIndex = (currentIndex + 1) % households.length;
            } else {
                currentIndex = (currentIndex + 1) % contactList.length;
            }
        }

        if (groupByHousehold) {
            const households = Object.values(householdMap);
            for (let i = currentIndex; i < households.length; i++) {
                const household = households[i];

                for (let j = 0; j < household.length; j++) {
                    const contact = household[j];
                    const recentCall = callsList ? callsList.find((call) => call.contact_id === contact.id) : null;
                    if (!recentCall && contact.phone && j === 0) {
                        nextContact = contact;
                        currentContactIndex.current = i;
                        foundNext = true;
                        break;
                    }
                }
                if (foundNext) break;
            }
        } else {
            for (let i = currentIndex; i < contactList.length; i++) {
                const contact = contactList[i];
                const recentCall = callsList ? callsList.find((call) => call.contact_id === contact.id) : null;
                if (!recentCall && contact.phone) {
                    nextContact = contact;
                    currentContactIndex.current = i;
                    foundNext = true;
                    break;
                }
            }
        }

        if (!foundNext) {
            nextContact = null;
        }
        setNextRecipient(nextContact);
        return nextContact;
    };

    useEffect(() => {
        nextNumber();
    }, []);

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

        const nextContact = nextNumber();
        if (nextContact) {
            handleCall(nextContact);
            if (groupByHousehold) {
                currentContactIndex.current = (currentContactIndex.current + 1) % Object.values(householdMap).length;
            } else {
                currentContactIndex.current = (currentContactIndex.current + 1) % contactList.length;
            }
        } else {
            currentContactIndex.current = 0;
        }
        currentContactIndex.current = 0;
    };

    return (
        <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexDirection: "column", position: "sticky", top: "0px", background: "hsl(var(--background))", padding: "8px", boxShadow: "0px 2px 0 0 #333", zIndex: 99 }}>
                <div style={{ padding: '16px 0', display: 'flex', justifyContent: "space-between" }}>
                    <div className="flex row gap2" style={{ display: 'flex', gap: "8px" }}>
                        <button disabled style={{ padding: "8px 16px", background: "#d60000", borderRadius: "5px", color: 'white', opacity: ".5" }}>
                            Predictive Dial
                        </button>
                        <button onClick={dialNextContact} style={{ padding: "8px 16px", border: "1px solid #d60000", borderRadius: "5px" }}>
                            Dial Next
                        </button>
                    </div>
                    <div className="flex row gap2" style={{ display: 'flex' }}>
                        {(incomingCall || activeCall) && (
                            <><div>
                                <button onClick={() => hangUp()} style={{ padding: "8px 16px", border: "1px solid #d60000", borderRadius: "5px" }}>Hang Up</button>
                            </div></>
                        )}
                    </div>
                </div>
                {nextRecipient && (
                    <div style={{ display: 'flex', alignItems: "center", justifyContent: 'space-between', border: '1px solid #ccc', borderRadius: '5px', padding: "8px", marginBottom: "10px" }}>
                        <div >
                            <strong>Next Recipient: </strong> {nextRecipient.firstname} {nextRecipient.surname} ({nextRecipient.phone})
                        </div>
                        <div>
                            <button onClick={() => nextNumber(true)}>SKIP</button>
                        </div>
                    </div>
                )}
            </div>
            <div className="flex column" style={{ display: "flex", flexDirection: "column" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", background: "hsl(var(--background))", border: "2px solid #333" }}>
                    <TableHeader keys={["Name", "Number", "Address", "Status", "", "Updates"]} />
                    <tbody>
                        {groupByHousehold ?
                            Object.values(householdMap).map((household, index) => (
                                household.map((contact, index) => (
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
                                        household={household}
                                        firstInHouse={index === 0}
                                        grouped={true}
                                    />
                                ))
                            )) :
                            contactList.map((contact) => (
                                <CallContact
                                    openRef={openRef}
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
