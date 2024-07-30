import {
  LoaderFunctionArgs,
  redirect,
  ActionFunctionArgs,
} from "@remix-run/node";
import {
  json,
  useFetcher,
  useLoaderData,
  useOutletContext,
} from "@remix-run/react";
import { findPotentialContacts, getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { useEffect, useRef, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { MdSend, MdExpandMore, MdClose } from "react-icons/md";
import { normalizePhoneNumber, stripPhoneNumber } from "~/lib/utils";

const phoneRegex = /^(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;

  if (workspaceId == null) {
    return json(
      {
        workspace: null,
        error: "Workspace does not exist",
        userRole: null,
      },
      { headers },
    );
  }

  const userRole = getUserRole({ serverSession, workspaceId });
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select(`*, workspace_number(*)`)
    .eq("id", workspaceId)
    .single();

  return json(
    {
      workspace,
      error: workspaceError,
      userRole,
    },
    { headers },
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const workspaceId = params.id;
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const res = await fetch(`${process.env.BASE_URL}/api/chat_sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      body: data.body,
      to_number: data.to_number,
      caller_id: data.from,
      workspace_id: workspaceId,
      contact_id: data.contact_id,
    }),
  });
  const responseData = await res.json();

  return redirect(`../${normalizePhoneNumber(data.to_number)}`);
}

export default function NewChat() {
  const { supabase } = useOutletContext<{ supabase: SupabaseClient }>();
  const { workspace, error: workspaceError, userRole } = useLoaderData();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isValid, setIsValid] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const messageFetcher = useFetcher({ key: "messages" });
  const [isContactMenuOpen, setIsContactMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const searchContact = async () => {
      if (isValid && phoneNumber) {
        try {
          const { data, error } = await supabase.rpc("find_contact_by_phone", {
            p_workspace_id: workspace.id,
            p_phone_number: phoneNumber,
          });
          if (error) throw error;
          if (data && data.length > 0) {
            setContacts(data);
            setSelectedContact(null);
            setIsContactMenuOpen(true);
            setSearchError(null);
          } else {
            setContacts([]);
            setSelectedContact(null);
            setSearchError("No contact found. A new contact will be created.");
          }
        } catch (error) {
          console.error("Contact search error:", error);
          setContacts([]);
          setSelectedContact(null);
          setSearchError("Error searching for contact.");
        }
      } else {
        setContacts([]);
        setSelectedContact(null);
        setSearchError(null);
      }
    };

    searchContact();
  }, [phoneNumber, isValid, supabase, workspace.id]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsContactMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handlePhoneChange = (e) => {
    const value = e.target.value;
    setPhoneNumber(value);
    setIsValid(phoneRegex.test(value));
    setSelectedContact(null);
  };

  const handleContactSelect = (contact) => {
    setSelectedContact(contact);
    setIsContactMenuOpen(false);
  };

  const toggleContactMenu = () => {
    setIsContactMenuOpen(!isContactMenuOpen);
  };

  const clearSelectedContact = () => {
    setSelectedContact(null);
  };

  if (workspaceError) {
    return <div>Error: {workspaceError.message}</div>;
  }

  return (
    <div className="flex h-full flex-col bg-gray-100">
      <div className="sticky top-0 z-10 flex bg-white p-4 shadow">
        <div className="flex flex-auto items-center gap-2">
          <h2 className="text-xl font-semibold">New Chat</h2>
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
              {!isValid && phoneNumber && (
                <p className="mt-1 text-sm text-red-500">
                  Please enter a valid phone number
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
                          {contact.firstname} {contact.surname} -{" "}
                          {contact.phone}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {searchError && (
        <p className="px-4 py-2 text-sm text-red-500">{searchError}</p>
      )}

      <div className="h-[400px] flex-1 overflow-y-auto p-4"></div>

      <div className="border-t bg-white p-4">
        <messageFetcher.Form method="POST" className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2">
            <label htmlFor="from" className="text-sm font-medium">
              From:
            </label>
            <select
              name="from"
              id="from"
              className="flex-grow rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {workspace?.workspace_number?.map((num) => (
                <option key={num.id} value={num.phone_number}>
                  {num.phone_number}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <textarea
              placeholder="Type your message"
              rows={3}
              className="flex-grow resize-none rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              name="body"
              id="body"
            />
            <button
              type="submit"
              disabled={messageFetcher.state !== "idle" || !isValid}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:bg-gray-400"
            >
              <MdSend size={20} />
            </button>
          </div>
          <input hidden value={phoneNumber} type="hidden" name="to_number" />
          {selectedContact && (
            <input
              hidden
              value={selectedContact.id}
              type="hidden"
              name="contact_id"
            />
          )}
        </messageFetcher.Form>
      </div>
    </div>
  );
}
