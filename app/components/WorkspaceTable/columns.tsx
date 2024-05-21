import type { ColumnDef } from "@tanstack/react-table";
import type { Audience, Campaign, Contact } from "~/lib/types";

export const audienceColumns: ColumnDef<Audience>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
];

export const campaignColumns: ColumnDef<Campaign>[] = [
  {
    accessorKey: "title",
    header: () => (
      <div className="flex h-full items-center border-r-2 border-white">
        Name
      </div>
    ),
    cell: ({ row }) => {
      return (
        <div className="flex h-full items-center border-r-2 border-white">
          {row.getValue("title")}
        </div>
      );
    },
  },
  {
    accessorKey: "start_date",
    header: "Start Date",
  },
  {
    accessorKey: "end_date",
    header: "End Date",
  },
  {
    accessorKey: "status",
    header: "Status",
  },
  {
    accessorKey: "type",
    header: "Type",
  },
];

export const contactColumns: ColumnDef<Contact>[] = [
  {
    accessorKey: "firstname",
    header: "First Name",
  },
  {
    accessorKey: "surname",
    header: "Last Name",
  },
  {
    accessorKey: "address",
    header: "Address",
  },
  {
    accessorKey: "city",
    header: "City",
  },
  {
    accessorKey: "phone",
    header: "Phone #",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
];
