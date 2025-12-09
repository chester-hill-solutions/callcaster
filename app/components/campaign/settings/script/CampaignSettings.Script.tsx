import React, { useState, useCallback } from 'react';
import { useNavigate } from '@remix-run/react';
import { Script, LiveCampaign, IVRCampaign } from '@/lib/types';
import { useScriptState } from '@/hooks/campaign/useScriptState';
import Sidebar from '@/components/script/Script.Sidebar';
import ScriptMainContent from '@/components/script/Script.MainContent';

type PageData = {
  campaignDetails: (LiveCampaign | IVRCampaign) & { script: Script };
};

type ScriptPageProps = {
  pageData: PageData;
  onPageDataChange: (data: PageData) => void;
  scripts: Script[];
  mediaNames: string[];
};

export default function CampaignSettingsScript({
  pageData,
  onPageDataChange,
  scripts,
  mediaNames = [],
}: ScriptPageProps) {
  const { script, scriptData, updateScript, updateScriptData } = useScriptState(pageData, onPageDataChange);
  const [currentPage, setCurrentPage] = useState(getFirstPageId(scriptData));
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const navigate = useNavigate();

  const changeType = useCallback((newType: string) => {
    updateScript((prevScript) => ({ ...prevScript, type: newType }));
  }, [updateScript]);

  const handleTitle = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    updateScript((prevScript) => ({ ...prevScript, name: event.target.value }));
  }, [updateScript]);

  const addBlock = useCallback(() => {
    const newBlockId = `block_${Object.keys(scriptData.blocks || {}).length + 1}`;
    updateScriptData((prevScriptData) => {
      const newBlock = {
        id: newBlockId,
        title: "New Block",
        type: "textarea",
        content: "",
        options: [],
      };
      return {
        ...prevScriptData,
        blocks: { ...prevScriptData.blocks, [newBlockId]: newBlock },
        pages: {
          ...prevScriptData.pages,
          [currentPage]: {
            ...prevScriptData.pages[currentPage],
            blocks: [...(prevScriptData.pages[currentPage].blocks || []), newBlockId],
          },
        },
      };
    });
    setOpenBlock(newBlockId);
    return newBlockId;
  }, [currentPage, scriptData, updateScriptData]);

  const removeBlock = useCallback((id: string) => {
    updateScriptData((prevScriptData) => {
      const updatedBlocks = { ...prevScriptData.blocks };
      delete updatedBlocks[id];
      const updatedPages = { ...prevScriptData.pages };
      Object.keys(updatedPages).forEach((pageId) => {
        updatedPages[pageId].blocks = updatedPages[pageId].blocks.filter(
          (blockId) => blockId !== id
        );
      });
      return { ...prevScriptData, blocks: updatedBlocks, pages: updatedPages };
    });
  }, [updateScriptData]);

  const moveBlock = useCallback((id: string, direction: number) => {
    updateScriptData((prevScriptData) => {
      const currentPageBlocks = prevScriptData.pages[currentPage].blocks;
      const currentIndex = currentPageBlocks.indexOf(id);
      if (
        (direction === -1 && currentIndex === 0) ||
        (direction === 1 && currentIndex === currentPageBlocks.length - 1)
      ) {
        return prevScriptData;
      }
      const newIndex = currentIndex + direction;
      const newBlocksOrder = [...currentPageBlocks];
      [newBlocksOrder[currentIndex], newBlocksOrder[newIndex]] = [
        newBlocksOrder[newIndex],
        newBlocksOrder[currentIndex],
      ];
      return {
        ...prevScriptData,
        pages: {
          ...prevScriptData.pages,
          [currentPage]: {
            ...prevScriptData.pages[currentPage],
            blocks: newBlocksOrder,
          },
        },
      };
    });
  }, [currentPage, updateScriptData]);

  const updateBlock = useCallback((id: string, newBlockData: Partial<Script['steps']['blocks'][string]>) => {
    updateScriptData((prevScriptData) => ({
      ...prevScriptData,
      blocks: {
        ...prevScriptData.blocks,
        [id]: {
          ...prevScriptData.blocks[id],
          ...newBlockData,
        },
      },
    }));
  }, [updateScriptData]);

  const addPage = useCallback(() => {
    const newPageId = `page_${Object.keys(scriptData.pages || {}).length + 1}`;
    updateScriptData((prevScriptData) => ({
      ...prevScriptData,
      pages: {
        ...prevScriptData.pages,
        [newPageId]: {
          id: newPageId,
          title: `New Section ${Object.keys(prevScriptData.pages || {}).length + 1}`,
          blocks: [],
        },
      },
    }));
    setCurrentPage(newPageId);
  }, [scriptData, updateScriptData]);

  const removeSection = useCallback((id: string) => {
    updateScriptData((prevScriptData) => {
      const newScriptData = { ...prevScriptData };
      delete newScriptData.pages[id];
      return newScriptData;
    });
  }, [updateScriptData]);

  const handleScriptChange = useCallback((value: string) => {
    if (value === `create-new-${scripts.length + 1}`) {
      navigate("../../../../scripts/new");
    } else {
      const newScript = scripts.find((script) => script.id === value);
      if (newScript) {
        updateScript(() => newScript);
        updateScriptData(() => newScript.steps);
        setCurrentPage(getFirstPageId(newScript.steps));
        setOpenBlock(null);
      }
    }
  }, [navigate, scripts, updateScript, updateScriptData]);

  const handleSectionNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (currentPage) {
      updateScriptData((prevScriptData) => ({
        ...prevScriptData,
        pages: {
          ...prevScriptData.pages,
          [currentPage]: {
            ...prevScriptData.pages[currentPage],
            title: event.target.value,
          },
        },
      }));
    }
  }, [currentPage, updateScriptData]);

  const handleReorder = useCallback((draggedId: string, targetId: string, dropPosition: 'top' | 'bottom') => {
    updateScriptData((prevScriptData) => {
      const currentPageBlocks = prevScriptData.pages[currentPage].blocks;
      const draggedIndex = currentPageBlocks.indexOf(draggedId);
      const targetIndex = currentPageBlocks.indexOf(targetId);

      if (draggedIndex === -1 || targetIndex === -1) return prevScriptData;

      const newBlocksOrder = [...currentPageBlocks];
      newBlocksOrder.splice(draggedIndex, 1);
      const newTargetIndex = dropPosition === "top" ? targetIndex : targetIndex + 1;
      newBlocksOrder.splice(newTargetIndex, 0, draggedId);

      return {
        ...prevScriptData,
        pages: {
          ...prevScriptData.pages,
          [currentPage]: {
            ...prevScriptData.pages?.[currentPage],
            blocks: newBlocksOrder,
          },
        },
      };
    });
  }, [currentPage, updateScriptData]);

  return (
    <div className="flex h-full gap-4">
      <Sidebar
        scriptData={scriptData}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        openBlock={openBlock}
        setOpenBlock={setOpenBlock}
        addPage={addPage}
        addBlock={addBlock}
        scripts={scripts}
        handleScriptChange={handleScriptChange}
      />
      <ScriptMainContent
        script={script}
        scriptData={scriptData}
        currentPage={currentPage}
        openBlock={openBlock}
        setOpenBlock={setOpenBlock}
        handleTitle={handleTitle}
        changeType={changeType}
        handleSectionNameChange={handleSectionNameChange}
        removeSection={removeSection}
        removeBlock={removeBlock}
        moveBlock={moveBlock}
        updateBlock={updateBlock}
        handleReorder={handleReorder}
        mediaNames={mediaNames}
      />
    </div>
  );
}

function getFirstPageId(scriptData: Script['steps']) {
  return Object.values(scriptData?.pages || {}).length > 0
    ? Object.values(scriptData.pages)[0].id
    : null;
}