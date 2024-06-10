import { TableHeader } from "./CallList/TableHeader";
import QueueContact from "./CallList/CallContact/CallContact";

function QueueList({
    groupByHousehold = true,
    queue = [],
    householdMap,
    handleNextNumber,
    nextRecipient,
    predictive = false,
    handleQueueButton
}) {
    return (
        <div style={{ flex: '1 0 20%', border: '3px solid #BCEBFF', borderRadius: "20px", marginBottom: "2rem", minHeight: '300px',boxShadow:"3px 5px 0  rgba(50,50,50,.6)" }}>
            <div style={{
                display: 'flex',
                alignItems: "center",
                justifyContent: 'space-between',
                borderTopLeftRadius: '18px',
                borderTopRightRadius: '18px',
                padding: "16px ",
            }}
                className="bg-brand-secondary text-slate-800 font-Tabac-Slab text-xl "
            >
                <div className="flex row gap2" style={{ display: 'flex', gap: "8px", flex: "auto" }}>
                    {!predictive ? (<>
                        <button onClick={() => handleNextNumber(true)} style={{ flex: "1 1 auto", padding: "4px 8px", background: "#d60000", borderRadius: "5px", color: 'white', fontSize: 'small' }}>
                            Skip Household
                        </button><button onClick={() => handleNextNumber(false)} style={{ flex: "1 1 auto", padding: "4px 8px", border: "1px solid #d60000", borderRadius: "5px", fontSize: 'small' }}>
                            Skip Person
                        </button></>) :
                        <div className="text-center flex-1">
                            <h4>Recipient List</h4>
                        </div>
                    }
                </div>
            </div>

            <div className="flex column" style={{ display: "flex", flexDirection: "column" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <TableHeader keys={["Name", "Number", "Address"]} />
                    {queue.length > 0 && predictive && <tbody>
                        {groupByHousehold && householdMap ?
                            Object.values(householdMap).map((household) => (
                                household.map((contact, index) => (
                                    <QueueContact
                                        key={`household-${contact.contact?.id}`}
                                        contact={contact.contact}
                                        household={household}
                                        firstInHouse={index === 0}
                                        grouped={true}
                                        selected={nextRecipient?.contact?.id === contact.contact.id}
                                    />
                                ))
                            )) :
                            queue.map((contact) => (
                                <QueueContact
                                    key={contact?.contact?.id}
                                    contact={contact?.contact}
                                    selected={nextRecipient?.contact?.id === contact.contact.id}
                                />
                            ))}
                    </tbody>}
                    {queue.length > 0 && !predictive ? <tbody>
                        {groupByHousehold && householdMap ?
                            Object.values(householdMap).map((household) => (
                                household.map((contact, index) => (
                                    <QueueContact
                                        key={`household-${contact.contact?.id}`}
                                        contact={contact.contact}
                                        household={household}
                                        firstInHouse={index === 0}
                                        grouped={true}
                                        selected={nextRecipient?.contact?.id === contact.contact.id}
                                    />
                                ))
                            )) :
                            queue.map((contact) => (
                                <QueueContact
                                    key={contact?.contact?.id}
                                    contact={contact?.contact}
                                    selected={nextRecipient?.contact?.id === contact.contact.id}
                                />
                            ))}
                    </tbody> : (
                        !(queue.length > 0 || householdMap.length > 0) && !predictive ? (
                        <tr>
                            <td colSpan={3} style={{ padding: "36px", textAlign: "center" }}>
                                <button onClick={handleQueueButton} style={{ flex: "1 1 auto", padding: "4px 8px", border: "1px solid #d60000", borderRadius: "5px", fontSize: 'small' }}>Load Queue</button>
                            </td>
                        </tr>)
                        : !queue.length > 0 ? <tr>
                            <td colSpan={3} style={{ padding: "36px", textAlign: "center", opacity:'.5' }}>
                                Check with your administration to ensure your queue is set up.
                            </td>
                        </tr>
                        : null) }
                </table>

            </div>
        </div>
    );
}

export { QueueList };