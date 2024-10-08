import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { AudienceForm } from "./AudienceForm";
import { ContactTable } from "./ContactTable";
import { ImportIcon } from "lucide-react";
import { useSearchParams, useSubmit } from "@remix-run/react";
import { parseCSV } from "~/lib/utils";
import TablePagination from "./TablePagination";

const AudienceTable = ({
  contacts: initialContacts,
  workspace_id,
  selected_id: audience_id,
  audience: initialAudience,
  pagination
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
  const [searchParams, setSearchParams] = useSearchParams();

  const submit = useSubmit();

  useEffect(() => {
    setContacts(initialContacts);
    setAudienceInfo(initialAudience);
  }, [initialContacts, initialAudience]);

  const handlePageChange = (newPage) => {
    setSearchParams({ page: newPage.toString(), pageSize: pagination.pageSize.toString() });
  };



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


  const readCSVFile = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const { headers, contacts } = parseCSV(e.target.result);
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

  const handleRemoveContact = async (id) => {
    setContacts((curr) => curr.filter((contact) => contact.id !== id));
    const formData = new FormData();
    formData.append('contact_id', id)
    formData.append('audience_id', audience_id);
    submit(formData, {
      action: '/api/contact-audience',
      method: "DELETE",
      navigate: false
    })
  }
  const totalPages = Math.ceil(pagination.totalCount / pagination.pageSize);

  return (
    <div className="w-full overflow-scroll">
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
            accept=".csv"
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
            handleRemoveContact
          }}
        />
      </div>
     <div className="my-4 text-[#333]">
     <TablePagination currentPage={pagination.currentPage} totalPages={totalPages} onPageChange={handlePageChange}/>
     </div>
    </div>
  );
};

export { AudienceTable };
