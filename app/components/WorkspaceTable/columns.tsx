import type { ColumnDef } from "@tanstack/react-table";
import type { Audience, Campaign, Contact } from "~/lib/types";
import { formatDateToLocale, formatTableText } from "~/lib/utils";
import { Progress } from "~/components/ui/progress";
import { MdDownload, MdEdit, MdRemoveCircle } from "react-icons/md";
import { Button } from "../ui/button";
import { NavLink, useFetcher, useSubmit } from "@remix-run/react";
import { useEffect } from "react";

export const audienceColumns: ColumnDef<Audience>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      return (
        <div className="flex flex-auto min-w-[250px]">
          {row.original.name || `Unnamed audience`}
        </div>
      );
    },
    minSize: 270,
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
    header: "Download",
    cell: ({ row }) => {
      const fetcher = useFetcher();
      useEffect(() => {
        if (fetcher.data) {
          const blob = new Blob([fetcher.data], { 
            type: "text/csv;charset=utf-8",
          });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.setAttribute("download", "audiences.csv");
          document.body.appendChild(link);
          link.click();
          link.parentNode?.removeChild(link);
        }
      }, [fetcher.data]);
      return (
        <fetcher.Form method="GET" action="/api/audiences">
          <input type="hidden" name="audienceId" value={row.original?.id} />
          <input type="hidden" name="returnType" value="csv" />
          <Button 
            type="submit"
            variant="ghost"
            disabled={fetcher.state === "submitting"}
          >
            {fetcher.state === "submitting" ? (
              "Downloading..."
            ) : (
              <MdDownload className="text-brand-primary dark:text-white" />
            )}
          </Button>
        </fetcher.Form>
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
              submit({id: row.original.id}, {
                method:"DELETE",
                action:"/api/audiences",
                navigate:false
              })
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
