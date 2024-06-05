import { TableHeader } from "./CallList/TableHeader";
import QueueContact from "./CallList/CallContact/CallContact";

function QueueList({
    groupByHousehold = true,
    queue = [],
    householdMap,
    handleNextNumber,
    nextRecipient
}) {

    return (
        <div style={{ flex: '1 0 20%', border: '3px solid #BCEBFF', borderRadius: "20px", marginBottom: "2rem" }}>
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
                <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
                    Upcoming
                </div>
                <div className="flex row gap2" style={{ display: 'flex', gap: "8px" }}>
                    <button onClick={() => handleNextNumber(true)} style={{ padding: "8px 16px", background: "#d60000", borderRadius: "5px", color: 'white', fontSize:'small' }}>
                        Skip Household
                    </button>
                    <button onClick={() => handleNextNumber(false)} style={{ padding: "8px 16px", border: "1px solid #d60000", borderRadius: "5px", fontSize:'small' }}>
                        Skip Person
                    </button>
                </div>
            </div>

            <div className="flex column" style={{ display: "flex", flexDirection: "column" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <TableHeader keys={["Name", "Number", "Address"]} />
                    <tbody>
                        {groupByHousehold && householdMap ?
                            Object.values(householdMap).map((household) => (
                                household.map((contact, index) => (
                                    <QueueContact
                                        key={`household-${contact.contact?.id}`}
                                        contact={contact.contact}
                                        household={household}
                                        firstInHouse={index === 0}
                                        grouped={true}
                                        selected={nextRecipient.contact.id === contact.contact.id}
                                    />
                                ))
                            )) :
                            queue.map((contact) => (
                                <QueueContact
                                    key={contact?.contact?.id}
                                    contact={contact?.contact}
                                    selected={nextRecipient.contact.id === contact.contact.id}
                                />
                            ))}
                    </tbody>
                </table>

            </div>
        </div>
    );
}

export { QueueList };