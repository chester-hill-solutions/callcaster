import { useEffect, useState } from "react";
import { PhoneIcon, PauseIcon, SetIcon, CheveronDownIcon } from "../Icons";
import Note from "./CallContact/Note";
import Result from "./CallContact/Result";
import { ContactInfo } from "./CallContact/ContactInfo";

const CallContact = ({ contact, callsList, handleReplay, handlePause, handleCall, isPlaying, showUpdate, handleShowUpdate, questions }) => {
    const [recentCall, setRecentCall] = useState(callsList?.find(call => call.contact_id === contact.id) || null);
    const [update, setUpdate] = useState({});

    const intentAction = ({ column, value }) => setUpdate((curr) => ({ ...curr, [column]: value }));
    const handleChange = (key, value) => setUpdate((curr) => ({ ...curr, [key]: value }));
    const handleSave = () => null;

    useEffect(() => {
        setRecentCall(callsList?.find(call => call.contact_id === contact.id) || null);
    }, [callsList, contact.id]);
    
    return (
        <>
            <tr className={`text-sm border-t border-gray-300 ${showUpdate === contact.id ? 'bg-gray-100' : ''}`}>
                <td className="px-4 py-2">{contact.firstname} {contact.surname}</td>
                <td className="px-4 py-2">{contact.phone}</td>
                <td className="px-4 py-2">{contact.address}</td>
                <td className="px-4 py-2 capitalize">
                    {recentCall?.status || 'Pending'}
                </td>
                <td className="px-4 py-2">
                    {recentCall?.status === 'completed' ? (
                        <button>
                            <SetIcon width={'20px'} fill={'#336633'} className="fill-green-500 w-5" />
                        </button>
                    ) : recentCall?.status === 'queued' || recentCall?.status === 'ringing' || recentCall?.status === 'initiated' ? (
                        <button>
                            <PhoneIcon width={'20px'} fill={'#333366'} className="fill-blue-500 w-5 animate-pulse" />
                        </button>
                    ) : isPlaying ? (
                        <button onClick={handlePause}>
                            <PauseIcon width={'20px'} className="fill-red-500 w-5" />
                        </button>
                    ) : (
                        <button onClick={() => handleCall(contact)}>
                            <PhoneIcon width={'20px'} fill={'#3333cc'} className="fill-blue-500 w-5" />
                        </button>
                    )}
                </td>
                <td className="px-4 py-2 text-center justify-center flex">
                    <button onClick={() => handleShowUpdate(contact.id)}>
                        <CheveronDownIcon width="20px" fill={'#333'} className={`fill-gray-700 w-5 transition-transform ${showUpdate === contact.id ? 'rotate-180' : ''}`} />
                    </button>
                </td>
            </tr>
            {showUpdate === contact.id && (
                <tr className="bg-gray-50 border-t border-gray-300">
                    <td colSpan={6} className="px-4 py-2">
                        <div className="flex flex-col gap-2 p-4">
                            {Object.keys(questions).sort((a, b) => questions[a].order - questions[b].order).map((key) => (
                                <Result key={key} action={intentAction} question={questions[key]} />
                            ))}
                            <ContactInfo action={handleSave} handleChange={handleChange} contact={contact} />
                            <Note action={() => null} initialVal="" />
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

export default CallContact;
