import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { AudienceForm } from "./AudienceForm";
import { ContactTable } from "./ContactTable";
import { ImportIcon } from "lucide-react";
import { useSubmit } from "@remix-run/react";
import { parseCSVData, parseCSVHeaders } from "~/lib/utils";

import { parse } from "csv-parse/sync";

const AudienceTable = ({
  contacts: initialContacts,
  workspace_id,
  selected_id: audience_id,
  audience: initialAudience,
}) => {
  const [contacts, setContacts] = useState(initialContacts);
  const [audienceInfo, setAudienceInfo] = useState(initialAudience);
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
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
    try {
      const file = e.dataTransfer.files[0];
      if (file && file.type === "text/csv") {
        readCSVFile(file);
      } else {
        throw `File type ${file.type} unsupported.`
      }
    } catch (error) {
      console.log(error);
    } finally {
      e.target.value = '';
    }
  };

  const handleOnClick = (e) => {
    e.preventDefault();
    try {
      const file = e.target.files[0];
      if (file.type === "text/csv") {
        readCSVFile(file);
      } else {
        throw `File type ${file.type} unsupported.`
      }
    } catch (error) {
      console.log(error);
    } finally {
      e.target.value = '';
    }
  };

  const testParser = (text) => {
    const records = parse(text);
    return records;
  };

  const readCSVFile = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const records = testParser(text);
      const parsedHeaders = parseCSVHeaders(records[0]);

      const contacts = parseCSVData(records, parsedHeaders);
      submit(
        { contacts, audience_id, workspace_id },
        {
          action: "/api/contacts",
          method: "POST",
          encType: "application/json",
          navigate: false,
        },
      );
    };
    reader.readAsText(file);
  };

  const inputRef = useRef(null);

  return (
    <div className="w-full">
      <div id="audience-settings" className="flex justify-between items-center">
        <div className="p-4">
          <AudienceForm
            audienceInfo={audienceInfo}
            handleSaveAudience={handleSaveAudience}
            handleAudienceChange={handleAudienceChange}
            audience_id={audience_id}
            workspace_id={workspace_id}
          />
        </div>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            name="file"
            id="file"
            ref={inputRef}
            className="hidden"
            onChange={handleOnClick}
          />
          <Button asChild className={`${isDragging ? "bg-gray-200" : "bg-brand-primary"}`}>
            <label htmlFor="file">
              IMPORT{" "}
              <span style={{ transform: "rotate(180deg)", marginLeft: "1rem" }}>
                <ImportIcon />
              </span>
            </label>
          </Button>
        </div>
      </div>
      <div className="flex" style={{ maxHeight: "800px", overflow: 'scroll' }}>
        <ContactTable
          {...{
            contacts,
            audience_id,
            newContact,
            handleInputChange,
            handleSaveContact,
            workspace_id,
          }}
        />
      </div>
    </div>
  );
};

export { AudienceTable };
