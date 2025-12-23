
import { Contact } from "~/lib/types";

interface ContactInfoProps {
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSave: () => void;
  contact: Contact;
}

export const ContactInfo = ({ handleChange, handleSave, contact }: ContactInfoProps) => (
    <div className="row justify-space-between align-center" style={{display:'flex', justifyContent:"space-between", alignContent:"center"}}>
        <div className="flex-half" style={{flex:"1 1 50%"}}>
            <p>Contact Info</p>
            <p className="caption xx-small" style={{fontSize:"xx-small"}}>Confirm your email and phone number.</p>
        </div>
        <div className="column flex-half gap1 align-end" style={{display:"flex", flexDirection:"column", gap:"8px"}}>
            <div className="confirm-contact">
                <input className="textbox white" name="phone" placeholder="Phone Number" type="tel" onChange={handleChange} value={contact.phone || ""} onBlur={handleSave} />
            </div>
            <div className="confirm-contact">
                <input className="textbox" name="email" placeholder="Email Address" type="text" onChange={handleChange} value={contact.email || ""} onBlur={handleSave} />
            </div>
        </div>
    </div>
)