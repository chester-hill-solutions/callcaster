import type { ColumnDef } from "@tanstack/react-table";
import type { Contact } from "~/lib/types";
import { Button } from "../ui/button";
import { NavLink } from "@remix-run/react";
import { MdEdit } from "react-icons/md";
import { formatDateToLocale } from "~/lib/utils";

export const paginatedContactColumns: ColumnDef<Contact>[] = [
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
    header: "Other Data",
    accessorKey: "other_data",
    cell: ({ getValue }) => {
      const other_data = getValue() as any[];
      return (
        <div>
          {other_data?.map((item, i) => {
            const [key, value] = Object.entries(item)[0];
            return (
              <div key={`other-data-${i}`}>
                {key}: {value}
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
    cell: ({ getValue }) => {
      const formatted = formatDateToLocale(getValue() as string);
      return <div>{formatted.split(",")[0]}</div>;
    },
  },
  {
    id: "edit",
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
];