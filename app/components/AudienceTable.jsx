import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { AudienceForm } from "./AudienceForm";
import { ContactTable } from "./ContactTable";
import { ImportIcon } from "lucide-react";
import { useSubmit } from "@remix-run/react";

const AudienceTable = ({ contacts: initialContacts, workspace_id, selected_id: audience_id, audience: initialAudience }) => {
    const [contacts, setContacts] = useState(initialContacts);
    const [audienceInfo, setAudienceInfo] = useState(initialAudience);
    const [newContact, setNewContact] = useState({ name: "", phone: "", email: "", address: "" });
    const [isDragging, setIsDragging] = useState(false);
    const submit = useSubmit();

    useEffect(() => {
        setContacts(initialContacts);
        setAudienceInfo(initialAudience);
    }, [initialContacts, initialAudience]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewContact((prevContact) => ({ ...prevContact, [name]: value }));
    };

    const handleAudienceChange = (e) => {
        const { name, value } = e.target;
        setAudienceInfo((prevContact) => ({ ...prevContact, [name]: value }));
    };

    const handleSaveContact = async () => {
        setNewContact({ name: "", phone: "", email: "", address: "" });
    };

    const handleSaveAudience = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const response = await fetch("/api/audiences", {
            method: "PATCH",
            body: formData,
        });
        const result = await response.json();

        if (response.ok) {
            setAudienceInfo(result);
        } else {
            console.error("Failed to save audience", result);
        }
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'text/csv') {
            readCSVFile(file);
        }
    };
    const readCSVFile = (file) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const rows = text.split('\n');
            const contacts = rows.slice(1).map(row => {
                const [firstname, surname, phone, email, address] = row.split(',');
                return { firstname, surname, phone, email, address };
            });
            submit({ contacts, audience_id, workspace_id }, {
                action: '/api/contacts',
                method: 'POST',
                encType:"application/json",
                navigate: false,
            })
        }
        reader.readAsText(file);
    };
    return (
        <div className="max-h-[800px] overflow-y-scroll">
            <div id="audience-settings" className="flex justify-between">
                <div className="p-4">
                    <AudienceForm
                        audienceInfo={audienceInfo}
                        handleAudienceChange={handleAudienceChange}
                        handleSaveAudience={handleSaveAudience}
                        audience_id={audience_id}
                    />
                </div>
                <div
                    className={`p-4 ${isDragging ? 'bg-gray-200' : 'bg-brand-primary'}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <Button>
                        IMPORT <span style={{ transform: "rotate(180deg)", marginLeft: "1rem" }}><ImportIcon /></span>
                    </Button>
                </div>
            </div>
            <ContactTable {...{ contacts, audience_id, newContact, handleInputChange, handleSaveContact, workspace_id }} />

        </div>
    );
};

export { AudienceTable };
