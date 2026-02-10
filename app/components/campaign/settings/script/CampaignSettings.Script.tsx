import React, { useState, useCallback } from 'react';
import { useNavigate } from '@remix-run/react';
import { Script, LiveCampaign, IVRCampaign } from '@/lib/types';
import { useScriptState } from '@/hooks/campaign/useScriptState';
import Sidebar from '@/components/script/Script.Sidebar';
import ScriptMainContent from '@/components/script/Script.MainContent';
import { logger } from '@/lib/logger.client';
import { isObject, isString } from '@/lib/type-utils';

type PageData = {
  campaignDetails: (LiveCampaign | IVRCampaign) & { script: Script };
};

type ScriptPageProps = {
  pageData: PageData;
  onPageDataChange: (data: PageData) => void;
  scripts: Script[];
  mediaNames: string[];
};

interface ScriptData {
  pages: Record<string, ScriptPage>;
  blocks: Record<string, ScriptBlock>;
}

interface ScriptPage {
  id: string;
  title: string;
  blocks: string[];
}

interface ScriptBlock {
  id: string;
  type: string;
  content?: unknown;
  [key: string]: unknown;
}

interface BlockUpdate {
  id: string;
  type?: string;
  content?: unknown;
  [key: string]: unknown;
}

// Type guard for script data
function isScriptData(data: unknown): data is ScriptData {
  if (!isObject(data)) return false;
  const scriptData = data as Record<string, unknown>;
  return (
    isObject(scriptData.pages) &&
    isObject(scriptData.blocks)
  );
}

// Type guard for script page
function isScriptPage(data: unknown): data is ScriptPage {
  if (!isObject(data)) return false;
  const page = data as Record<string, unknown>;
  return (
    isString(page.id) &&
    isString(page.title) &&
    Array.isArray(page.blocks)
  );
}

// Type guard for block update
function isBlockUpdate(data: unknown): data is BlockUpdate {
  if (!isObject(data)) return false;
  const update = data as Record<string, unknown>;
  return isString(update.id);
}

export default function CampaignSettingsScript({
  pageData,
  onPageDataChange,
  scripts,
  mediaNames = [],
}: ScriptPageProps) {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState<string | null>(null);
  const [openBlock, setOpenBlock] = useState<string | null>(null);

  const script = pageData.campaignDetails.script;
  const scriptData: ScriptData = isScriptData(script.steps)
    ? script.steps
    : { pages: {}, blocks: {} };

  const updateScript = useCallback((newScript: Script | ((prev: Script) => Script)) => {
    onPageDataChange({
      ...pageData,
      campaignDetails: {
        ...pageData.campaignDetails,
        script: typeof newScript === "function" ? newScript(script) : newScript,
      },
    });
  }, [onPageDataChange, pageData, script]);

  const updateScriptData = useCallback((newScriptData: ScriptData | ((prev: ScriptData) => ScriptData)) => {
    const updatedScriptData = typeof newScriptData === "function" ? newScriptData(scriptData) : newScriptData;
    
    if (!isScriptData(updatedScriptData)) {
      logger.error('Invalid script data format');
      return;
    }
    
    updateScript({
      ...script,
      steps: updatedScriptData as unknown as NonNullable<Script["steps"]>,
    });
  }, [script, updateScript]);

  const addBlock = useCallback((type: string) => {
    if (!currentPage) return;
    
    const blockId = `block_${Date.now()}`;
    updateScriptData((prevScriptData) => ({
      ...prevScriptData,
      blocks: {
        ...prevScriptData.blocks,
        [blockId]: {
          id: blockId,
          type,
        } as ScriptBlock,
      },
      pages: {
        ...prevScriptData.pages,
        [currentPage]: {
          ...prevScriptData.pages[currentPage],
          id: currentPage,
          title: prevScriptData.pages[currentPage]?.title ?? "",
          blocks: [...(prevScriptData.pages[currentPage]?.blocks || []), blockId],
        } as ScriptPage,
      },
    }));
    setOpenBlock(blockId);
  }, [currentPage, updateScriptData]);

  const removeBlock = useCallback((blockId: string) => {
    updateScriptData((prevScriptData) => {
      const newScriptData = { ...prevScriptData };
      
      // Remove block from all pages
      Object.keys(newScriptData.pages).forEach((pageId) => {
        const page = newScriptData.pages[pageId];
        if (page) page.blocks = page.blocks.filter((id) => id !== blockId);
      });
      
      // Remove block definition
      delete newScriptData.blocks[blockId];
      
      return newScriptData;
    });
    setOpenBlock(null);
  }, [updateScriptData]);

  const moveBlock = useCallback((blockId: string, targetPageId: string) => {
    updateScriptData((prevScriptData) => {
      const newScriptData = { ...prevScriptData };
      
      // Remove block from current page
      if (currentPage) {
        const page = newScriptData.pages[currentPage];
        if (page) page.blocks = page.blocks.filter((id) => id !== blockId);
      }
      
      // Add block to target page
      if (!newScriptData.pages[targetPageId]) {
        newScriptData.pages[targetPageId] = {
          id: targetPageId,
          title: `Section ${Object.keys(newScriptData.pages).length + 1}`,
          blocks: [],
        };
      }
      newScriptData.pages[targetPageId].blocks.push(blockId);
      
      return newScriptData;
    });
  }, [currentPage, updateScriptData]);

  const handleTitle = useCallback((blockId: string, title: string) => {
    updateScriptData((prevScriptData) => ({
      ...prevScriptData,
      blocks: {
        ...prevScriptData.blocks,
        [blockId]: {
          ...prevScriptData.blocks[blockId],
          id: blockId,
          type: prevScriptData.blocks[blockId]?.type ?? "textblock",
          title,
        } as ScriptBlock,
      },
    }));
  }, [updateScriptData]);

  const changeType = useCallback((blockId: string, newType: string) => {
    updateScriptData((prevScriptData) => ({
      ...prevScriptData,
      blocks: {
        ...prevScriptData.blocks,
        [blockId]: {
          ...prevScriptData.blocks[blockId],
          id: blockId,
          type: newType,
          title: prevScriptData.blocks[blockId]?.title ?? "",
        } as ScriptBlock,
      },
    }));
  }, [updateScriptData]);

  const updateBlock = useCallback((id: string, newBlockData: BlockUpdate) => {
    if (!isBlockUpdate(newBlockData)) {
      logger.error('Invalid block update format');
      return;
    }
    
    updateScriptData((prevScriptData) => ({
      ...prevScriptData,
      blocks: {
        ...prevScriptData.blocks,
        [id]: {
          ...prevScriptData.blocks[id],
          ...newBlockData,
          id,
        } as ScriptBlock,
      },
    }));
  }, [updateScriptData]);

  const addPage = useCallback(() => {
    const newPageId = `page_${Object.keys(scriptData?.pages || {}).length + 1}`;
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
      const newScript = scripts.find((script) => script.id === parseInt(value));
      if (newScript && isScriptData(newScript.steps)) {
        updateScript(() => newScript);
        updateScriptData(() => newScript.steps as unknown as ScriptData);
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
            id: currentPage,
            title: event.target.value,
            blocks: prevScriptData.pages[currentPage]?.blocks ?? [],
          } as ScriptPage,
        },
      }));
    }
  }, [currentPage, updateScriptData]);

  const handleReorder = useCallback((draggedId: string, targetId: string, dropPosition: 'top' | 'bottom') => {
    if (!currentPage) return;
    updateScriptData((prevScriptData) => {
      const currentPageBlocks = prevScriptData.pages[currentPage].blocks;
      const draggedIndex = currentPageBlocks.indexOf(draggedId);
      const targetIndex = currentPageBlocks.indexOf(targetId);

      if (draggedIndex === -1 || targetIndex === -1) return prevScriptData;

      const newBlocksOrder = [...currentPageBlocks];
      newBlocksOrder.splice(draggedIndex, 1);
      const newTargetIndex = dropPosition === "top" ? targetIndex : targetIndex + 1;
      newBlocksOrder.splice(newTargetIndex, 0, draggedId);

      const curPage = prevScriptData.pages[currentPage];
      return {
        ...prevScriptData,
        pages: {
          ...prevScriptData.pages,
          [currentPage]: {
            ...curPage,
            id: currentPage,
            title: curPage?.title ?? "",
            blocks: newBlocksOrder,
          } as ScriptPage,
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

function getFirstPageId(scriptData: unknown): string | null {
  if (!isScriptData(scriptData)) {
    return null;
  }
  
  const pages = scriptData.pages || {};
  const pageValues = Object.values(pages);
  
  if (pageValues.length > 0) {
    const firstPage = pageValues[0];
    if (isScriptPage(firstPage)) {
      return firstPage.id || Object.keys(pages)[0];
    }
  }
  
  return Object.keys(pages)[0] || null;
}