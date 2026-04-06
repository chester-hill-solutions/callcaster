import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Flow } from "@/lib/types";

type SidebarProps = {
  scriptData: Flow;
  currentPage: string | null;
  setCurrentPage: (pageId: string) => void;
  addPage: () => void;
};

export default function Sidebar({
  scriptData,
  currentPage,
  setCurrentPage,
  addPage,
}: SidebarProps) {
  const hasSections = Object.keys(scriptData.pages || {}).length > 0;

  return (
    <div className="w-1/4 border-r pr-4" style={{ width: "25%" }}>
      <div className="flex h-full flex-col">
        <div className="mb-1 w-full text-center font-semibold">Sections</div>
        <p className="mb-3 text-center text-xs text-muted-foreground">
          {!hasSections
            ? "Start here: add your first section."
            : "Choose a section, then add blocks in the editor."}
        </p>
        <Button
          className="mb-4 w-full"
          onClick={addPage}
          variant={hasSections ? "outline" : "default"}
        >
          Add Section <Plus className="ml-2 h-4 w-4" />
        </Button>
        {Object.values(scriptData.pages || {}).map((page) => (
          <Button
            key={page.id}
            className="mb-2 w-full justify-start"
            variant={currentPage === page.id ? "default" : "outline"}
            onClick={() => setCurrentPage(page.id)}
          >
            {page.title}
          </Button>
        ))}
        {!hasSections && (
          <p className="text-center text-sm text-muted-foreground">
            No sections yet.
          </p>
        )}
      </div>
    </div>
  );
}
