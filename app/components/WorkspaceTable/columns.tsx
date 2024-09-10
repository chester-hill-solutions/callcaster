import type { ColumnDef } from "@tanstack/react-table";
import type { Audience, Campaign, Contact } from "~/lib/types";
import { formatDateToLocale, formatTableText } from "~/lib/utils";
import { Progress } from "~/components/ui/progress";
import { MdEdit, MdRemoveCircle } from "react-icons/md";
import { Button } from "../ui/button";
import { NavLink, useSubmit } from "@remix-run/react";

type AudienceWithContactCount = Audience & {
  contact_audience: [{ count: number }];
};

export const audienceColumns: ColumnDef<AudienceWithContactCount>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      return (
        <div className="flex min-w-[250px] flex-auto">
          {row.original.name || `Unnamed audience`}
        </div>
      );
    },
    minSize: 270,
  },
  {
    accessorKey: "count",
    header: "Contacts",
    cell: ({ row }) => {
      return <div className="">{row.original.contact_audience[0].count}</div>;
    },
  },
  {
    header: "Edit",
    cell: ({ row }) => {
      return (
        <Button asChild variant="ghost">
          <NavLink to={`${row.original?.id}`}>
            <MdEdit />
          </NavLink>
        </Button>
      );
    },
    maxSize: 50,
  },
  {
    header: "Delete",
    cell: ({ row }) => {
      const submit = useSubmit();
      return (
        <Button
          onClick={(e) => {
            submit(
              { id: row.original.id },
              {
                method: "DELETE",
                action: "/api/audiences",
                navigate: false,
              },
            );
          }}
        >
          <MdRemoveCircle />
        </Button>
      );
    },
    maxSize: 50,
  },
];

export const campaignColumns: ColumnDef<Campaign>[] = [
  {
    accessorKey: "title",
    header: "Name",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const formattedType = formatTableText(row.getValue("status"));
      return <div>{formattedType}</div>;
    },
  },
  {
    accessorKey: "progress",
    header: "Completion",
    cell: ({ row }) => {
      const progress = row.getValue("progress") * 100;
      return (
        <div className="flex flex-col items-center gap-1">
          <p className="font-Zilla-Slab font-bold">{progress}%</p>
          <Progress value={progress} />
        </div>
      );
    },
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => {
      const formattedType = formatTableText(row.getValue("type"));
      return <div>{formattedType}</div>;
    },
  },
  {
    accessorKey: "start_date",
    header: "Start Date",
    cell: ({ row }) => {
      const formatted = formatDateToLocale(row.getValue("start_date"));
      return <div className="">{formatted}</div>;
    },
  },
  {
    accessorKey: "end_date",
    header: "End Date",
    cell: ({ row }) => {
      const formatted = formatDateToLocale(row.getValue("start_date"));
      return <div className="">{formatted}</div>;
    },
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
