//TODO: add close button. Update multiselect appearance

export const NewContactForm = ({ fetcher, openContact, handleContact, newContact, audiences }) => {
    return (<fetcher.Form className="flex column gap2" method="post" encType="multipart/form-data" onSubmit={openContact}>
        <div className="flex row gap2">
            <div>
                <label htmlFor="firstname" className="caption xx-small">First Name</label>
                <input name="firstname" className="textbox" value={newContact.firstname} onChange={(e) => handleContact(e.target.name, e.target.value)} />
            </div>
            <div>
                <label htmlFor="surname" className="caption xx-small">Last Name</label>
                <input name="surname" className="textbox" value={newContact.surname} onChange={(e) => handleContact(e.target.name, e.target.value)} />
            </div>
            <div>
                <label htmlFor="phone" className="caption xx-small">Phone</label>
                <input name="phone" type="tel" className="textbox" value={newContact.phone} onChange={(e) => handleContact(e.target.name, e.target.value)} />
            </div>
            <div>
                <label htmlFor="email" className="caption xx-small">Email</label>
                <input name="email" type="email" className="textbox" value={newContact.email} onChange={(e) => handleContact(e.target.name, e.target.value)} />
            </div>
        </div>
        <div className="flex row align-stretch gap2">
            <select name="audiences" multiple style={{ width: "100%" }} value={newContact.audiences} onChange={(e) => handleContact('audiences', e)}>
                {audiences.map((aud) => (
                    <option value={aud.id} key={aud.id}>{aud.name}</option>
                ))}
            </select>
            <button type="submit" style={{ background: "#d60000", padding: '16px', color: '#333' }}>
                ADD
            </button>
        </div>
    </fetcher.Form>)
}