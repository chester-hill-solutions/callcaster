import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { WorkspaceTableNames } from "~/lib/types";

export function WorkspaceDropdown({ selectTable }) {
  const [buttonText, setButtonText] = useState<string>(
    WorkspaceTableNames.Campaign + "s",
  );
  const handleDropdownSelection = (tableName: WorkspaceTableNames) => {
    setButtonText(tableName.valueOf() + "s");
    selectTable(tableName);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="w-fit text-2xl">
        <Button variant="default" className="p-4">
          {buttonText}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() => handleDropdownSelection(WorkspaceTableNames.Campaign)}
        >
          Campaigns
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDropdownSelection(WorkspaceTableNames.Audience)}
        >
          Audiences
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDropdownSelection(WorkspaceTableNames.Contact)}
        >
          Contacts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
