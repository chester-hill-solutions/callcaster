import { useState } from "react";

const Note = ({ action, update }) => {
    return (
        <div className={'row justify-space-between align-center'} style={{ display: "flex", justifyContent: 'space-between' }}>
            <div></div>
            <div>
                <textarea rows={2} className="textbox" value={update} onChange={(e) => action({column: "Note", value: e.target.value})} placeholder="Notes/Key Issues" >
                </textarea>
            </div>
        </div>
    )
}
export default Note