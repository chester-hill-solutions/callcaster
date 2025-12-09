import React from 'react';
import { FaPlus } from 'react-icons/fa';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Script } from '~/lib/types';

type SidebarProps = {
  scriptData: Script['steps'];
  currentPage: string | null;
  setCurrentPage: (pageId: string) => void;
  openBlock: string | null;
  setOpenBlock: (blockId: string | null) => void;
  addPage: () => void;
  addBlock: () => void;
  scripts: Script[];
  handleScriptChange: (value: string) => void;
};

export default function Sidebar({
  scriptData,
  currentPage,
  setCurrentPage,
  openBlock,
  setOpenBlock,
  addPage,
  addBlock,
  scripts,
  handleScriptChange,
}: SidebarProps) {
  return (
    <div className="w-1/4 border-r pr-4" style={{ width: "25%" }}>
      <div className="flex h-full flex-col justify-between">
        <div>
          <div className="mb-1 w-full text-center">Sections</div>
          <Button className="mb-4 w-full" onClick={addPage}>
            Add Section <FaPlus size="16px" className="ml-2 inline" />
          </Button>
          {Object.values(scriptData?.pages || {}).map((page) => (
            <Button
              key={page.id}
              className={`mb-2 w-full justify-start ${
                currentPage === page.id
                  ? "bg-primary text-white"
                  : "border-2 border-zinc-800 bg-transparent text-black"
              }`}
              onClick={() => setCurrentPage(page.id)}
            >
              {page.title}
            </Button>
          ))}
          <hr className="my-4" />
          <div className="mb-1 w-full text-center">Question Blocks</div>
          <Button className="mb-4 w-full" onClick={addBlock} disabled={!currentPage}>
            Add Block <FaPlus size="16px" className="ml-2 inline" />
          </Button>
          {currentPage &&
            scriptData?.pages[currentPage]?.blocks?.map((blockId) => (
              <Button
                key={blockId}
                className={`mb-2 w-full justify-start ${
                  openBlock === blockId
                    ? "bg-primary text-white"
                    : "border-2 border-zinc-800 bg-transparent text-black"
                }`}
                onClick={() => setOpenBlock(blockId)}
              >
                {(scriptData?.blocks && scriptData?.blocks[blockId].title) ||
                  blockId}
              </Button>
            ))}
        </div>
        <div>
          {scripts.length > 0 && (
            <div className="flex flex-col">
              <div className="flex">
                <h3 className="font-Zilla-Slab text-lg">Your Scripts</h3>
              </div>
              <div className="flex">
                <Select onValueChange={handleScriptChange}>
                  <SelectTrigger className="bg-white dark:bg-transparent">
                    <SelectValue
                      className="text-brand-primary"
                      placeholder="Select a script"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {scripts.map((script) => (
                      <SelectItem key={script.id} value={script.id}>
                        {script.name} - {script.type}
                      </SelectItem>
                    ))}
                    <SelectItem value={`create-new-${scripts.length + 1}`}>
                      Create New
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}