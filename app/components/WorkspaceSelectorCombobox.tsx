import { useNavigate } from "@remix-run/react";
import { CommandList } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { WorkspaceData } from "~/lib/types";
import { cn } from "~/lib/utils";

export default function WorkspaceSelectorCombobox({
  workspaces,
}: {
  workspaces: WorkspaceData;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const navigate = useNavigate();

  if (!workspaces) {
    return (
      <div className="border-2 border-gray-600 dark:border-transparent">
        No Workspaces Found
      </div>
    );
  }

  const combobox = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between border-2 border-gray-600 dark:border-transparent"
        >
          {value
            ? workspaces.find((workspace) => workspace.name === value)?.name
            : "Select Workspace..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandList>
            <CommandInput placeholder="Search Workspace..." />
            <CommandEmpty>No Workspaces Found.</CommandEmpty>
            <CommandGroup>
              {workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.name}
                  value={workspace.name}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                    navigate(`workspaces/${workspace.id}`);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === workspace.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {workspace.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
  return <>{combobox}</>;
}
