
export const ContactInfo = ({ handleChange, handleSave, contact }) => (

    <div className="row justify-space-between align-center" >
        <div className="flex-half">
            <p>Contact Info</p>
            <p className="caption xx-small">Confirm your email and phone number.</p>
        </div>
        <div className="column flex-half gap1 align-end" style={{display:"flex"}}>
            <div className="confirm-contact">
                <input className="textbox" name="phone" placeholder="Phone Number" type="tel" onChange={handleChange} value={contact.phone} onBlur={handleSave} />
            </div>
            <div className="confirm-contact">
                <input className="textbox" name="email" placeholder="Email Address" type="text" onChange={handleChange} value={contact.email} onBlur={handleSave} />
            </div>
        </div>
    </div>
)