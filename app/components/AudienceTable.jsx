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
  // Transform the contacts data to extract the nested contact info
  const transformedContacts = initialContacts?.map(item => item.contact) || [];
  const [contacts, setContacts] = useState(transformedContacts);
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
    const transformed = initialContacts?.map(item => item.contact) || [];
    setContacts(transformed);
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

  const sanitizeValue = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    // Remove null bytes and other problematic characters
    return str.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\uFFFD]/g, '');
  };

  const sanitizeContact = (contact) => {
    const sanitized = {};
    Object.entries(contact).forEach(([key, value]) => {
      sanitized[key] = sanitizeValue(value);
    });
    return sanitized;
  };

  const readCSVFile = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const { headers, contacts: rawContacts } = parseCSV(e.target.result);
      
      // Sanitize each contact and ensure required fields
      const sanitizedContacts = rawContacts.map(contact => ({
        firstname: sanitizeValue(contact.firstname),
        surname: sanitizeValue(contact.surname),
        phone: sanitizeValue(contact.phone),
        email: sanitizeValue(contact.email),
        address: sanitizeValue(contact.address),
        city: sanitizeValue(contact.city),
        province: sanitizeValue(contact.province),
        postal: sanitizeValue(contact.postal),
        country: sanitizeValue(contact.country),
        opt_out: false,
        workspace: workspace_id,
        other_data: []
      }));
      
      console.log('Sending contacts:', sanitizedContacts);

      submit(
        {
          contacts: sanitizedContacts,
          audience_id,
          workspace_id
        },
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
