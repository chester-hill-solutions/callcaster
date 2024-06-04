import { TableHeader } from "./CallList/TableHeader";
import QueueContact from "./CallList/CallContact/CallContact";

function QueueList({
    groupByHousehold = false,
    queue = []
}) {
    const householdMap = queue.reduce((acc, curr) => {
        if (!acc[curr.address]) {
            acc[curr.address] = [];
        }
        acc[curr.address].push(curr);
        return acc;
    }, {});

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
            </div>

            <div className="flex column" style={{ display: "flex", flexDirection: "column" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <TableHeader keys={["Name", "Number", "Address"]} />
                    <tbody>
                        {groupByHousehold ?
                            Object.values(householdMap).map((household) => (
                                household.map((contact, index) => (
                                    <QueueContact
                                        key={`household-${contact.id}`}
                                        contact={contact}
                                        household={household}
                                        firstInHouse={index === 0}
                                        grouped={true}
                                    />
                                ))
                            )) :
                            queue.map((contact) => (
                                <QueueContact
                                    key={contact.id}
                                    contact={contact}
                                />
                            ))}
                    </tbody>
                </table>

            </div>
        </div>
    );
}

export { QueueList };