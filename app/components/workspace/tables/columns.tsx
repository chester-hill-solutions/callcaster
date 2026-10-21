import type { ColumnDef } from "@tanstack/react-table";
import type { Audience, Campaign, Contact } from "@/lib/types";
import { formatDateToLocale, formatTableText } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { MdDownload, MdEdit, MdRemoveCircle } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { NavLink, useSubmit } from "react-router";
import { downloadBlobPart } from "@/lib/download-blob.client";

function audienceActionTarget(audience: Pick<Audience, "id" | "name">) {
  return `${audience.name || "Unnamed Call list"} (Call list ${audience.id})`;
}

function AudienceDownloadCell({ audienceId, audienceLabel }: {
  audienceId: string | number;
  audienceLabel: string;
}) {
  const handleDownload = async () => {
    const response = await fetch(
      `/api/audiences?audienceId=${encodeURIComponent(String(audienceId))}&returnType=csv`,
      { credentials: "include" },
    );
    if (!response.ok) {
      return;
    }
    downloadBlobPart({
      data: await response.text(),
      filename: "audiences.csv",
      mimeType: "text/csv;charset=utf-8",
    });
  };

  return (
    <Button
        type="button"
        variant="ghost"
        aria-label={`Download ${audienceLabel}`}
        onClick={() => {
          void handleDownload();
        }}
      >
        <MdDownload className="text-brand-primary dark:text-white" aria-hidden />
      </Button>
  );
}

function AudienceDeleteCell({ audienceId, audienceLabel }: {
  audienceId: string | number;
  audienceLabel: string;
}) {
  const submit = useSubmit();

  return (
    <Button
      aria-label={`Delete ${audienceLabel}`}
      onClick={() => {
        submit(
          { id: audienceId },
          {
            method: "DELETE",
            action: "/api/audiences",
            navigate: false,
          },
        );
      }}
    >
      <MdRemoveCircle aria-hidden />
    </Button>
  );
}

export const audienceColumns: ColumnDef<Audience>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      return (
        <div className="flex flex-auto min-w-[250px]">
          {row.original.name || `Unnamed Call list`}
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
          <NavLink
            to={`${row.original?.id}`}
            aria-label={`Edit ${audienceActionTarget(row.original)}`}
          >
            <MdEdit aria-hidden />
          </NavLink>
        </Button>
      );
    },
    maxSize: 50,
  },
  {
    header: "Download",
    cell: ({ row }) => {
      return <AudienceDownloadCell
        audienceId={row.original.id}
        audienceLabel={audienceActionTarget(row.original)}
      />;
    },
    maxSize: 50,
  },
  {
    header: "Delete",
    cell: ({ row }) => {
      return <AudienceDeleteCell
        audienceId={row.original.id}
        audienceLabel={audienceActionTarget(row.original)}
      />;
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
      const progress = (row.getValue("progress") as number) * 100;
      return (
        <div className="flex flex-col items-center gap-1">
          <p className="font-bold tabular-nums">{progress}%</p>
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
