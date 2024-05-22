import { useEffect, useState } from "react";
import { PhoneIcon, PauseIcon, SetIcon, CheveronDownIcon } from "../../Icons";
import Note from "./Note";
import Result from "./Result";
import { ContactInfo } from "./ContactInfo";

const CallContact = ({ contact, callsList, handleReplay, handlePause, handleCall, isPlaying, showUpdate, handleShowUpdate, questions, household = null, firstInHouse = false, grouped=false }) => {
    const [recentCall, setRecentCall] = useState(callsList?.find(call => call.contact_id === contact.id) || null);
    const [update, setUpdate] = useState({
        result: '',

    });

    const intentAction = ({ column, value }) => setUpdate((curr) => ({ ...curr, [column]: value }));
    const handleChange = (key, value) => setUpdate((curr) => ({ ...curr, update }));
    const handleSave = () => null;

    useEffect(() => {
        setRecentCall(callsList?.find(call => call.contact_id === contact.id) || null);
    }, [callsList, contact.id]);

    return (
        <>
            <tr style={{ fontSize: "small", border: grouped && '2px solid #C91D25'}}>
                <td style={{ padding: "8px 16px" }}>{contact.firstname} {contact.surname}</td>
                <td style={{ padding: "8px 16px", opacity: !household ? '1' : firstInHouse ? '1' : '.6' }}>{contact.phone}</td>
                {firstInHouse || !household ? (
                    <td style={{ padding: "8px 16px", verticalAlign: 'middle', background: !household ? 'unset' : firstInHouse ? "#BDEBFF" : 'unset'  }} rowSpan={household?.length} >{contact.address}</td>
                ) : null}
                {firstInHouse || !household ? (
                    <td style={{ padding: "8px 16px", textTransform: "capitalize", verticalAlign: 'middle' }} rowSpan={household?.length} >
                        {recentCall?.status || 'Pending'}
                    </td>
                ) : null}
                <td style={{ padding: "8px 16px" }}>
                    {recentCall?.status === 'completed' ? (
                        <button>
                            <SetIcon fill="#e6e6e6" width="20px" />
                        </button>
                    ) : isPlaying ? (
                        <button onClick={handlePause}>
                            <PauseIcon fill="#e6e6e6" width="20px" />
                        </button>
                    ) : (
                        <button onClick={() => handleCall(contact)}>
                            <PhoneIcon fill="#e6e6e6" width="20px" />
                        </button>
                    )}
                </td>
                <td style={{ padding: "8px 16px", textAlign: "center" }}>
                    <button onClick={() => handleShowUpdate(contact.id)}>
                        <CheveronDownIcon fill="#e6e6e6" width="20px" style={{ transform: showUpdate === contact.id ? 'rotate(.5turn)' : 'unset' }} />
                    </button>
                </td>
            </tr>
            {showUpdate === contact.id && (
                <tr style={{ borderBottom: '2px solid #333', padding: "2px", minHeight: "1px" }}>
                    <td colSpan={6} style={{ padding: "8px 16px" }}>
                        <div style={{ padding: "8px 16px", borderBottom: "2px solid #eee", display: "flex", flexDirection: "column" }}>
                            {Object.keys(questions).sort((a, b) => questions[a].order - questions[b].order).map((key) => (
                                <Result action={intentAction} questions={questions[key]} />
                            ))}
                            <ContactInfo action={handleSave} handleChange={handleChange} contact={contact} />
                            <Note action={() => null} initialVal={''} />
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

export default CallContact;