const QueueContact = ({ contact, household = null, firstInHouse = false, grouped = false, selected = false, isLast = false }) => {
    return (
        <>
            <tr style={{
                fontSize: "small",
                borderTop: grouped && firstInHouse ? '2px solid #C91D25' : grouped ? '2px solid hsl(var(--muted-foreground))' : 'unset',
                background: selected ? '#f1c1c1' :  'unset',
                borderBottomLeftRadius: isLast ? "18px" : 'unset'
            }}>
                <td style={{ padding: "8px 16px" }}>{contact.firstname} {contact.surname}</td>
                <td style={{ padding: "8px 16px", opacity: !household ? '1' : firstInHouse ? '1' : '.6' }}>{contact.phone}</td>
                {firstInHouse || !household ? (
                    <td style={{ padding: "8px 16px", verticalAlign: 'middle', background: !household ? 'unset' : firstInHouse ? "hsl(var(--secondary))" : 'unset', color: !household ? 'unset' : firstInHouse ? "#333" : 'unset', borderBottomRightRadius: isLast ? "18px" : 'unset' }} rowSpan={household?.length} >{contact.address}</td>
                ) : null}
            </tr>

        </>
    );
};

export default QueueContact;