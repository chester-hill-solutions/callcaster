import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { AudienceForm } from "./AudienceForm";
import { ContactTable } from "./ContactTable";
import { ImportIcon } from "lucide-react";
import { useSubmit } from "@remix-run/react";
import { parseCSVHeaders } from "~/lib/utils";

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
    const file = e.dataTransfer.files[0];
    if (file && file.type === "text/csv") {
      readCSVFile(file);
    }
  };

  const handleOnClick = (e) => {
    e.preventDefault();
    inputRef.current.click();
    try {
      const file = inputRef.current.files[0];
      if (file.type === "text/csv") {
        readCSVFile(file);
      }
    } catch (error) {
      console.log(error);
    }

    // const file = e.dataTransfer.files[0];
    // if (file && file.type === "text/csv") {
    //   readCSVFile(file);
    // }
  };

  const testParser = (text) => {
    const records = parse(text);
    return records;
  };

  const readCSVFile = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      // const rows = text.split("\n");
      const records = testParser(text);
      // console.log(records);

      // const parsedHeaders = parseCSVHeaders(rows[0].split(","));
      // const parsedHeadersLength = Object.keys(parsedHeaders).length;
      const parsedHeaders = parseCSVHeaders(records[0]);
      const parsedHeadersLength = Object.keys(parsedHeaders).length;

      const contacts = records.slice(1).flatMap((row) => {
        if (row.length < parsedHeadersLength) {
          return [];
        }

        let contact = {
          firstname: undefined,
          surname: undefined,
          phone: undefined,
          email: undefined,
          address: undefined,
        };

        if (parsedHeaders.name.length != null) {
          contact.firstname = row[parsedHeaders.name[0]]?.trim();
          contact.surname = row[parsedHeaders.name[1]]?.trim();
        } else {
          let names = row[parsedHeaders.name].split(" ");
          if (names.length > 0) {
            contact.firstname = names[0].trim();
          }

          if (names.length > 1) {
            contact.surname = names.at(-1).trim();
          }
        }

        contact.phone = row[parsedHeaders.phone].trim();
        contact.email = row[parsedHeaders.email].trim();
        contact.address = row[parsedHeaders.address].trim();
        // const [firstname, surname, phone, email, address] = row.split(",");
        return contact;
      });
      // console.log("Contacts: ", contacts);
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
    <div className="max-h-[800px] overflow-y-scroll">
      <div id="audience-settings" className="flex justify-between">
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
          className={`p-4 ${isDragging ? "bg-gray-200" : "bg-brand-primary"}`}
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
          />
          <Button onClick={handleOnClick} className="">
            IMPORT{" "}
            <span style={{ transform: "rotate(180deg)", marginLeft: "1rem" }}>
              <ImportIcon />
            </span>
          </Button>
        </div>
      </div>
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
  );
};

export { AudienceTable };
