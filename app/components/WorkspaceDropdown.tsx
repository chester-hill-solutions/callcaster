import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export function WorkspaceDropdown() {
  const [buttonText, setButtonText] = useState<string>("Campaigns");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="w-fit text-2xl">
        <Button variant="default" className="p-4">
          {buttonText}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => setButtonText("Campaigns")}>
          Campaigns
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setButtonText("Audiences")}>
          Audiences
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setButtonText("Contacts")}>
          Contacts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
