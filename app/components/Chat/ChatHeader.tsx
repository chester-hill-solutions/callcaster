import { MdClose, MdExpandMore } from "react-icons/md";
import { Button } from "../ui/button";

export default function ChatHeader({
  contact,
  outlet,
  phoneNumber,
  handlePhoneChange,
  isValid,
  selectedContact,
  clearSelectedContact,
  contacts,
  toggleContactMenu,
  isContactMenuOpen,
  handleContactSelect,
  dropdownRef,
  searchError,
  existingConversation,
  handleExistingConversationClick,
  potentialContacts,
  contactNumber,
  setDialog
}) {

  return (
    <div className="sticky top-0 z-10 flex bg-white p-4 shadow">
      <div className="flex flex-auto justify-between gap-2">
        <h2 className="text-xl font-semibold">Chat {!!outlet && `with ${contact ? `${contact.firstname} ${contact.surname}` : phoneNumber}`}</h2>
        {!outlet && (
          <div className="flex flex-auto items-center gap-2">
            <div className="relative flex-1">
              <input
                type="tel"
                id="phone"
                name="phone"
                value={phoneNumber}
                onChange={handlePhoneChange}
                required
                className={`mt-1 block w-full rounded-md ${
                  isValid ? "border-gray-300" : "border-red-500"
                } shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50`}
                placeholder="Enter phone number"
              />
              {!isValid && phoneNumber?.length > 9 && (
                <p className="absolute mt-1 text-sm text-red-500">
                  Please enter a valid phone number
                </p>
              )}
              {searchError && phoneNumber && (
                <p className="absolute mt-1 text-sm text-red-500">
                  {searchError}
                </p>
              )}
              {selectedContact && (
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 transform items-center">
                  <span className="mr-2 text-sm text-gray-600">
                    {selectedContact.firstname} {selectedContact.surname}
                  </span>
                  <button
                    onClick={clearSelectedContact}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <MdClose size={18} />
                  </button>
                </div>
              )}
            </div>
            {contacts.length > 0 && (
              <div
                className="relative inline-block text-left"
                ref={dropdownRef}
              >
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-100"
                  onClick={toggleContactMenu}
                >
                  {selectedContact
                    ? `${selectedContact.firstname} ${selectedContact.surname}`
                    : "Select Contact"}
                  <MdExpandMore
                    className="-mr-1 ml-2 h-5 w-5"
                    aria-hidden="true"
                  />
                </button>
                {isContactMenuOpen && (
                  <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div
                      className="py-1"
                      role="menu"
                      aria-orientation="vertical"
                      aria-labelledby="options-menu"
                    >
                      {contacts.map((contact) => (
                        <button
                          key={contact.id}
                          className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                          onClick={() => handleContactSelect(contact)}
                        >
                          {contact.firstname} {contact.surname} - {contact.phone}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {existingConversation && (
              <div className="absolute right-0 top-0 z-10 mt-2 w-56 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <button
                  onClick={() =>
                    handleExistingConversationClick(
                      existingConversation.phoneNumber,
                    )
                  }
                  className="ml-2 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  View Existing Conversation
                </button>
                <div className="mt-2 rounded-md bg-gray-100 p-2 text-sm">
                  <p>
                    <strong>Latest message:</strong>{" "}
                    {existingConversation.latestMessage}
                  </p>
                  <p>
                    <strong>Date:</strong> {existingConversation.date}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        {!!outlet && !potentialContacts?.length > 0 && (
          <div>
            <Button onClick={() => setDialog(true)}>Add {contactNumber}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
