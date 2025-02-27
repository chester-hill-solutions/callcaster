import { useEffect, useState } from "react";
import { AudienceForm } from "./AudienceForm";
import { ContactTable } from "./ContactTable";
import { useSearchParams, useSubmit } from "@remix-run/react";
import TablePagination from "./TablePagination";

const AudienceTable = ({
  contacts: initialContacts,
  workspace_id,
  selected_id: audience_id,
  audience: initialAudience,
  pagination
}) => {
  const transformedContacts = initialContacts?.map(item => item.contact) || [];
  const [contacts, setContacts] = useState(transformedContacts);
  const [audienceInfo, setAudienceInfo] = useState(initialAudience);
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
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


  const handleSaveContact = async () => {
    setNewContact({ name: "", phone: "", email: "", address: "" });
  };


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
  
  const handleBulkDeleteComplete = (deletedIds) => {
    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      setContacts((curr) => curr.filter((contact) => !deletedIds.includes(contact.id)));
      if (audienceInfo && typeof audienceInfo.total_contacts === 'number') {
        setAudienceInfo(prev => ({
          ...prev,
          total_contacts: prev.total_contacts - deletedIds.length
        }));
      }
    }
  };
  
  const totalPages = Math.ceil(pagination.totalCount / pagination.pageSize);

  return (
    <div className="w-full overflow-scroll">
      <div className="flex" style={{ maxHeight: "800px", overflow: 'scroll' }}>
        <ContactTable
          {...{
            contacts,
            audience_id,
            newContact,
            handleInputChange,
            handleSaveContact,
            workspace_id,
            handleRemoveContact,
            onBulkDeleteComplete: handleBulkDeleteComplete
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
