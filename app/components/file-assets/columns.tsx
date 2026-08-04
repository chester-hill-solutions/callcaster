import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { formatDateToLocale } from "@/lib/utils";
import type { FileObject } from "@/lib/types";

/** mm:ss. Null means the sidecar has no row yet, not a zero-length file. */
function formatDuration(durationMs: number | null | undefined) {
  if (durationMs == null) return "—";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatSize(sizeBytes: number | null | undefined) {
  if (sizeBytes == null) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const mediaColumns: ColumnDef<FileObject>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "durationMs",
    header: "Length",
    cell: ({ row }) => (
      <div className="tabular-nums">
        {formatDuration(row.original.durationMs)}
      </div>
    ),
  },
  {
    accessorKey: "sourceFileName",
    header: "Derived from",
    cell: ({ row }) => {
      const source = row.original.sourceFileName;
      return (
        <div className="text-muted-foreground">
          {source ? source : "—"}
        </div>
      );
    },
  },
  {
    accessorKey: "sizeBytes",
    header: "Size",
    cell: ({ row }) => (
      <div className="tabular-nums">{formatSize(row.original.sizeBytes)}</div>
    ),
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => {
      const formatted = formatDateToLocale(row.getValue("created_at"));
      return <div className="">{formatted}</div>;
    },
  },
  {
    accessorKey: "signedUrl",
    header: "Audio",
    cell: ({ row }) => {
      const audioUrl = row.getValue("signedUrl");
      return (
        <div className="">
          <audio src={audioUrl as string} controls>
            <track kind="captions" />
            Can`&apos`t show audio
          </audio>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <Button asChild variant="outline" size="sm">
        <Link to={`./${encodeURIComponent(row.original.name)}/edit`}>
          Edit
        </Link>
      </Button>
    ),
  },
];
