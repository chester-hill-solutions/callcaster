import { useState } from "react";

const Note = ({ action, initialVal }) => {
    const [value, setValue] = useState(initialVal);
    return (
        <div className={'row justify-space-between align-center'} >
            <div></div>
            <div>
                <textarea rows={2} className="textbox" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Notes/Key Issues" >
                </textarea>
            </div>
        </div>
    )
}
export default Note