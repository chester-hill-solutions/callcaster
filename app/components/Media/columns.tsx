import type { ColumnDef } from "@tanstack/react-table";
import type { FileObject } from "@supabase/storage-js";
import { formatDateToLocale } from "~/lib/utils";

export const mediaColumns: ColumnDef<FileObject>[] = [
  {
    accessorKey: "name",
    header: "Name",
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
            Can`&apos`t show audio
          </audio>
        </div>
      );
    },
  },
  // {
  //   accessorKey: "metadata.size",
  //   header: "Size",
  // },
  // {
  //   accessorKey: "metadata.contentLength",
  //   header: "Length",
  // },
];
