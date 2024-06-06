import { useState } from "react";
export function WorkspaceDropdown({
  selectTable,
  selectedTable,
  tables,
}: {
  selectTable: (tableName: string) => object;
  selectedTable: string;
  tables: Array<T>;
}) {

  return (
    <select
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
