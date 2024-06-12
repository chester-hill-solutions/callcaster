import type { ColumnDef } from "@tanstack/react-table";
import type { Audience, Campaign, Contact } from "~/lib/types";
import { formatDateToLocale, formatTableText } from "~/lib/utils";
import { Progress } from "~/components/ui/progress";

export const audienceColumns: ColumnDef<Audience>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({row}) => {
      return <div>{row.original.name || `Unnamed audience`}</div>
    }
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
