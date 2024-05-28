import { useEffect, useState } from "react";
import { PhoneIcon, PauseIcon, SetIcon, CheveronDownIcon } from "../../Icons";
import Note from "./Note";
import Result from "./Result";
import { ContactInfo } from "./ContactInfo";
import { useSubmit } from "@remix-run/react";

const CallContact = ({ contact, callsList, handleCall, showUpdate, handleShowUpdate, questions, household = null, firstInHouse = false, grouped = false, openRef }) => {
    const submit = useSubmit();
    const [recentCall, setRecentCall] = useState(() => {
        const filteredCalls = callsList
            .filter(call => call.contact_id === contact.id)
            .sort((a, b) => {
                if (Object.keys(b.answers).length !== 0 && Object.keys(a.answers).length === 0) {
                    return 1;
                } else if (Object.keys(a.answers).length !== 0 && Object.keys(b.answers).length === 0) {
                    return -1;
                }
                return new Date(b.date_created) - new Date(a.date_created);
            });
        return filteredCalls.length > 0 ? filteredCalls[0] : null;
    });
    const [update, setUpdate] = useState({ ...recentCall?.answers });
    const [contactUpdate, setContactUpdate] = useState({ ...contact })
    const intentAction = ({ column, value }) => setUpdate((curr) => ({ ...curr, [column]: value }));

    const handleContactSave = () => submit(contactUpdate, {
        method: "PATCH",
        navigate: false,
        action: `/api/contacts`,
        encType: 'application/json'
    });

    const handleQuestionsSave = () => submit({ update, callId: recentCall.sid }, {
        method: "PATCH",
        navigate: false,
        action: `/api/questions`,
        encType: 'application/json'
    });

    useEffect(() => {
        const handler = setTimeout(() => {
            if (recentCall && JSON.stringify(update) !== JSON.stringify(recentCall?.answers)) {
                handleQuestionsSave();
            }
            if (JSON.stringify(contact) !== JSON.stringify(contactUpdate)){
                handleContactSave();
            }
        }, 5000);
        return () => {
            clearTimeout(handler);
        };
    }, [update, recentCall, contactUpdate]);

    useEffect(() => {
        setRecentCall(() => {
            const filteredCalls = callsList
                .filter(call => call.contact_id === contact.id)
                .sort((a, b) => {
                    if (Object.keys(b.answers).length !== 0 && Object.keys(a.answers).length === 0) {
                        return 1;
                    } else if (Object.keys(a.answers).length !== 0 && Object.keys(b.answers).length === 0) {
                        return -1;
                    }
                    return new Date(b.date_created) - new Date(a.date_created);
                });
            return filteredCalls.length > 0 ? filteredCalls[0] : null;
        });
    }, [callsList, contact.id]);

    const isHouseholdOpen = household.find((contact) => contact.id === showUpdate);
    const isOpen = contact.id === showUpdate;

    return (
        <>
            <tr style={{ fontSize: "small", borderTop: grouped && firstInHouse ? '2px solid #C91D25' : grouped ? '2px solid hsl(var(--muted-foreground))' : 'unset' }}>
                <td style={{ padding: "8px 16px" }}>{contact.firstname} {contact.surname}</td>
                <td style={{ padding: "8px 16px", opacity: !household ? '1' : firstInHouse ? '1' : '.6' }}>{contact.phone}</td>
                {firstInHouse || !household ? (
                    <td style={{ padding: "8px 16px", verticalAlign: 'middle', background: !household ? 'unset' : firstInHouse ? "hsl(var(--secondary))" : 'unset', color: !household ? 'unset' : firstInHouse ? "#333" : 'unset' }} rowSpan={isHouseholdOpen ? 1 : household?.length} >{contact.address}</td>
                ) : isHouseholdOpen ? <td style={{ padding: "8px 16px" }}>{contact.address}</td> : null}
                {firstInHouse || !household ? (
                    <td style={{ padding: "8px 16px", textTransform: "capitalize", verticalAlign: 'middle' }} rowSpan={isHouseholdOpen ? 1 : household?.length} >
                        {recentCall?.status || 'Pending'}
                    </td>
                ) : isHouseholdOpen ? <td style={{ padding: "8px 16px" }}>{recentCall?.status || 'Pending'}</td> : null}
                <td style={{ padding: "8px 16px" }}>
                    {recentCall?.status === 'completed' ? (
                        <button>
                            <SetIcon fill="#33aa33" width="20px" />
                        </button>
                    ) : (
                        <button onClick={() => handleCall(contact)}>
                            <PhoneIcon fill="hsl(var(--brand-tertiary))" width="20px" />
                        </button>
                    )}
                </td>
                <td style={{ padding: "8px 16px", textAlign: "center" }}>
                    <button onClick={() => handleShowUpdate(contact.id)}>
                        <CheveronDownIcon fill="hsl(var(--accent-foreground))" width="20px" style={{ transform: isOpen ? 'rotate(.5turn)' : 'unset' }} />
                    </button>
                </td>
            </tr>
            {isOpen && (
                <tr ref={openRef} style={{ borderBottom: '2px solid #333', padding: "2px", minHeight: "1px", background: "hsl(var(--background))", boxShadow: "inset 2px 2px 0 #333" }}>
                    <td colSpan={6} style={{ padding: "8px 16px", }}>
                        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: '16px' }}>
                            {Object.keys(questions).sort((a, b) => questions[a].order - questions[b].order).map((key) => (
                                <Result action={intentAction} questions={questions[key]} key={`questions-${key}`} questionId={key} initResult={recentCall?.answers[key]} />
                            ))}
                            <ContactInfo action={handleContactSave} handleChange={(e) => setContactUpdate((curr) => ({ ...curr, [e.target.name]: e.target.value }))} contact={contactUpdate} />
                            <Note action={intentAction} update={update["Note"]} />
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

export default CallContact;