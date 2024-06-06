import type { ColumnDef } from "@tanstack/react-table";
import type { Audience, Campaign, Contact } from "~/lib/types";

export function WorkspaceDropdown({
  selectTable,
  selectedTable,
  tables,
}: {
  selectTable: (tableName: string) => void;
  selectedTable: string;
  tables: Array<{name: string,columns:ColumnDef<Campaign>[], data:Array<Campaign | Contact | Audience>}>;
}) {

  return (
    <select
      title="Workspace Table Selector"
      className="w-full bg-brand-primary text-white font-Zilla-Slab px-0.5 py-1 text-xl"
      value={selectedTable}
      name="Workspace-Table"
      onChange={(e) => {selectTable(e.currentTarget.value)}}
    >
      {tables.map((table) => {
        return (
          <option
            key={`select-${table.name}`}
            value={table.name}
            className="capitalize"
          >
            {table.name[0].toUpperCase() + table.name.substring(1)}
          </option>
        );
      })}
    </select>
  );
}
