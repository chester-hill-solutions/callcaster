import { FetcherWithComponents } from "@remix-run/react";
import { Audience } from "~/lib/types";

interface NewContact {
  firstname: string;
  surname: string;
  phone: string;
  email: string;
  audiences: string[];
}

interface NewContactFormProps {
  fetcher: FetcherWithComponents<any>;
  openContact: (e: React.FormEvent<HTMLFormElement>) => void;
  handleContact: (name: string, value: string | React.ChangeEvent<HTMLSelectElement>) => void;
  newContact: NewContact;
  audiences: Audience[];
}

export const NewContactForm = ({ fetcher, openContact, handleContact, newContact, audiences }: NewContactFormProps) => {
    return (
        <fetcher.Form method="post" encType="multipart/form-data" onSubmit={openContact} className="space-y-6">
            <div className="flex flex-col gap-6 max-w-3xl mx-auto p-6 bg-white shadow-md rounded-lg">
                <div className="flex gap-6">
                    <div className="flex flex-col w-full">
                        <label htmlFor="firstname" className="text-sm font-medium text-gray-700">First Name</label>
                        <input
                            name="firstname"
                            className="mt-1 border border-gray-300 p-2 rounded shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            value={newContact.firstname}
                            onChange={(e) => handleContact(e.target.name, e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col w-full">
                        <label htmlFor="surname" className="text-sm font-medium text-gray-700">Last Name</label>
                        <input
                            name="surname"
                            className="mt-1 border border-gray-300 p-2 rounded shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            value={newContact.surname}
                            onChange={(e) => handleContact(e.target.name, e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex gap-6">
                    <div className="flex flex-col w-full">
                        <label htmlFor="phone" className="text-sm font-medium text-gray-700">Phone</label>
                        <input
                            name="phone"
                            type="tel"
                            className="mt-1 border border-gray-300 p-2 rounded shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            value={newContact.phone}
                            onChange={(e) => handleContact(e.target.name, e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col w-full">
                        <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
                        <input
                            name="email"
                            type="email"
                            className="mt-1 border border-gray-300 p-2 rounded shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            value={newContact.email}
                            onChange={(e) => handleContact(e.target.name, e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-4">
                    <label htmlFor="audiences" className="text-sm font-medium text-gray-700">Select Audiences</label>
                    <select
                        name="audiences"
                        multiple
                        className="w-full h-48 border border-gray-300 p-2 rounded shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                        value={newContact.audiences}
                        onChange={(e) => handleContact('audiences', e)}
                    >
                        {audiences.map((aud: Audience) => (
                            <option value={aud.id} key={aud.id} className="p-2">{aud.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex justify-end">
                    <button
                        type="submit"
                        style={{backgroundColor:"#d60000", borderRadius:'5px'}}
                        className="bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                        ADD
                    </button>
                </div>
            </div>
        </fetcher.Form>
    );
}
