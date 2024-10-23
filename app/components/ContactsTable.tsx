import { Contact } from "~/lib/types";
import { DataTable } from "./WorkspaceTable/DataTable";
import { formatDateToLocale } from "~/lib/utils";
import { Button } from "./ui/button";
import { MdEdit } from "react-icons/md";
import { NavLink } from "react-router-dom";

export default function ContactsTable({ contacts }: { contacts: Contact[] }) {
    if (!contacts) return null; 

    return (
        <DataTable
            className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
            data={contacts}
            columns={[
                {
                    accessorKey: "firstname",
                    header: "First",
                },
                {
                    accessorKey: "surname",
                    header: "Last",
                },
                {
                    accessorKey: "phone",
                    header: "Phone Number",
                },
                {
                    accessorKey: "email",
                    header: "Email Address",
                },
                {
                    accessorKey: "address",
                    header: "Street Address",
                },
                {
                    accessorKey: "city",
                    header: "City",
                },
                {
                    header: "Audiences",
                    cell: ({ row }) => {
                        const audienceIds = row.original.audience_ids || [];
                        const audienceNames = row.original.audience_names || [];
                        return (
                            <div>
                                {audienceNames.map((name, index) => (
                                    <span key={audienceIds[index]} className="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-1 mb-1">
                                        {name}
                                    </span>
                                ))}
                            </div>
                        );
                    },
                },
                {
                    header: "Other Data",
                    cell: ({ row }) => {
                        return (
                            <div>
                                {row.original.other_data?.map((item, i) => {
                                    return (
                                        <div key={`${row.id}-other-data-${i}`}>
                                            {Object.keys(item)}: {Object.values(item)}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    },
                },
                {
                    accessorKey: "created_at",
                    header: "Created",
                    cell: ({ row }) => {
                        const formatted = formatDateToLocale(
                            row.getValue("created_at"),
                        );
                        return <div className="">{formatted.split(",")[0]}</div>;
                    },
                },
                {
                    header: "Edit",
                    cell: ({ row }) => {
                        const id = row.original.id;
                        return (
                            <Button variant="ghost" asChild>
                                <NavLink to={`./${id}`} relative="path">
                                    <MdEdit />
                                </NavLink>
                            </Button>
                        );
                    },
                },
            ]}
        />
    ); 
}   
