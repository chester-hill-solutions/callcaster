import type { ColumnDef } from "@tanstack/react-table";
import type { Media } from "~/lib/types";
import { formatDateToLocale } from "~/lib/utils";

export const mediaColumns: ColumnDef<Media>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => {
      const formatted = formatDateToLocale(row.getValue("created_at"));
      return <div className="">{formatted.split(",")[0]}</div>;
    },
  },
  {
    accessorKey: "signedUrl",
    header: "Audio",
    cell: ({ row }) => {
      const audioUrl = row.getValue("signedUrl");
      console.log(audioUrl);
      return (
        <div className="">
          <audio src={audioUrl} controls>
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
