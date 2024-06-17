import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { AudienceForm } from "./AudienceForm";
import { ContactTable } from "./ContactTable";
import { ImportIcon } from "lucide-react";
import { useSubmit } from "@remix-run/react";

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
  const readCSVFile = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const rows = text.split("\n");
      const parsedHeaders = parseCSVHeaders(rows[0].split(","));
      const parsedHeadersLength = Object.keys(parsedHeaders).length;

      const contacts = rows.slice(1).flatMap((row) => {
        let columnData = row.split(",");
        if (columnData.length < parsedHeadersLength) {
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
          contact.firstname = columnData[parsedHeaders.name[0]].replace(
            /\W/g,
            "",
          );
          contact.surname = columnData[parsedHeaders.name[1]].replace(
            /\W/g,
            "",
          );
        } else {
          let [first, last] = columnData[parsedHeaders.name].split(" ");
          contact.firstname = first != null ? first.replace(/\W/g, "") : "";
          contact.surname = last != null ? last.replace(/\W/g, "") : "";
        }

        contact.phone = columnData[parsedHeaders.phone].replace(/\W/g, "");
        contact.email = columnData[parsedHeaders.email].replace(/\W/g, "");
        contact.address = columnData[parsedHeaders.address].replace(/\W/g, "");
        // const [firstname, surname, phone, email, address] = row.split(",");
        return contact;
      });
      //   console.log("Contacts: ", contacts);
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
  const parseCSVHeaders = (unparsedHeaders) => {
    const trimmedHeaders = unparsedHeaders.map((header) =>
      header.toLowerCase().replace(/\W/g, ""),
    );
    console.log(trimmedHeaders);
    let parsedHeaders = { name: null, phone: null, address: null, email: null };
    const regexChecks = {
      name: /name/,
      phone: /phone/,
      address: /address/,
      email: /email/,
    };
    for (let i = 0; i < trimmedHeaders.length; i++) {
      let header = trimmedHeaders[i];
      if (regexChecks.name.test(header)) {
        if (parsedHeaders["name"] != null) {
          let otherNameIndex = parsedHeaders["name"];
          console.log("first name index: ", otherNameIndex);
          if (/first/.test(header)) {
            parsedHeaders["name"] = [i, otherNameIndex];
          } else {
            console.log("HERE");
            parsedHeaders["name"] = [otherNameIndex, i];
            console.log(parsedHeaders["name"]);
          }
        } else {
          console.log("HERE???");
          parsedHeaders["name"] = i;
        }
      }

      for (let check of Object.keys(regexChecks)) {
        if (check === "name") continue;
        if (regexChecks[check].test(header)) {
          parsedHeaders[check] = i;
        }
      }
    }
    console.log(parsedHeaders);
    return parsedHeaders;
  };
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
          <Button>
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
