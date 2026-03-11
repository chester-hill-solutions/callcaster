import React, { useState, useCallback } from 'react';
import { useNavigate } from '@remix-run/react';
import { Block, Flow, IVRBlock, Script } from '@/lib/types';
import Sidebar from '@/components/script/Script.Sidebar';
import ScriptMainContent from '@/components/script/Script.MainContent';
import { isObject, isString } from '@/lib/type-utils';

type PageData = {
  campaignDetails: {
    script: Script;
    [key: string]: unknown;
  };
};

type ScriptPageProps = {
  pageData: PageData;
  onPageDataChange: (data: PageData) => void;
  scripts: Script[];
  mediaNames: string[];
};

type ScriptData = Flow;

function getFlowType(script: Script): Flow["type"] {
  return script.type === "ivr" ? "ivr" : "script";
}

function createEmptyFlow(type: Flow["type"]): Flow {
  return {
    type,
    pages: {},
    blocks: {},
    startPage: "",
  };
}

function createDefaultBlock(id: string, flowType: Flow["type"]): Block | IVRBlock {
  const baseBlock: Block = {
    id,
    type: "textarea",
    title: "",
    content: "",
    options: [],
  };

  if (flowType === "ivr") {
    return {
      ...baseBlock,
      audioFile: "",
      speechType: "synthetic",
      responseType: null,
    };
  }

  return baseBlock;
}

function normalizeFlow(script: Script): Flow {
  const flowType = getFlowType(script);
  if (!isObject(script.steps)) {
    return createEmptyFlow(flowType);
  }

  const raw = script.steps as Record<string, unknown>;
  const pages = isObject(raw.pages) ? raw.pages as Flow["pages"] : {};
  const blocks = isObject(raw.blocks) ? raw.blocks as Flow["blocks"] : {};
  const firstPageId = Object.keys(pages)[0] ?? "";

  return {
    type: raw.type === "ivr" ? "ivr" : raw.type === "script" ? "script" : flowType,
    pages,
    blocks,
    startPage: isString(raw.startPage) ? raw.startPage : firstPageId,
  };
}

export default function CampaignSettingsScript({
  pageData,
  onPageDataChange,
  scripts,
  mediaNames = [],
}: ScriptPageProps) {
  const navigate = useNavigate();
  const script = pageData.campaignDetails.script;
  const scriptData = normalizeFlow(script);
  const [currentPage, setCurrentPage] = useState<string | null>(
    scriptData.startPage || Object.keys(scriptData.pages)[0] || null,
  );
  const [openBlock, setOpenBlock] = useState<string | null>(null);

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

    updateScript({
      ...script,
      steps: updatedScriptData,
    });
  }, [script, scriptData, updateScript]);

  const addBlock = useCallback(() => {
    if (!currentPage) return;

    const blockId = `block_${Date.now()}`;
    const defaultBlock = createDefaultBlock(blockId, scriptData.type);
    updateScriptData((prevScriptData) => ({
      ...prevScriptData,
      blocks: {
        ...prevScriptData.blocks,
        [blockId]: defaultBlock,
      },
      pages: {
        ...prevScriptData.pages,
        [currentPage]: {
          ...prevScriptData.pages[currentPage],
          id: currentPage,
          title: prevScriptData.pages[currentPage]?.title ?? "",
          blocks: [...(prevScriptData.pages[currentPage]?.blocks || []), blockId],
        },
      },
    }));
    setOpenBlock(blockId);
  }, [currentPage, scriptData.type, updateScriptData]);

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

  const moveBlock = useCallback((blockId: string, direction: number) => {
    if (!currentPage) return;
    updateScriptData((prevScriptData) => {
      const currentPageData = prevScriptData.pages[currentPage];
      if (!currentPageData) return prevScriptData;

      const currentBlocks = [...currentPageData.blocks];
      const currentIndex = currentBlocks.indexOf(blockId);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex === -1 ||
        nextIndex < 0 ||
        nextIndex >= currentBlocks.length
      ) {
        return prevScriptData;
      }

      const currentItem = currentBlocks[currentIndex];
      const nextItem = currentBlocks[nextIndex];
      if (!currentItem || !nextItem) {
        return prevScriptData;
      }

      currentBlocks[currentIndex] = nextItem;
      currentBlocks[nextIndex] = currentItem;

      return {
        ...prevScriptData,
        pages: {
          ...prevScriptData.pages,
          [currentPage]: {
            ...currentPageData,
            blocks: currentBlocks,
          },
        },
      };
    });
  }, [currentPage, updateScriptData]);

  const handleTitle = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    updateScript((prevScript) => ({
      ...prevScript,
      name: value,
    }));
  }, [updateScript]);

  const changeType = useCallback((newType: "script" | "ivr") => {
    updateScript((prevScript) => ({
      ...prevScript,
      type: newType,
    }));
  }, [updateScript]);

  const updateBlock = useCallback((id: string, newBlockData: Partial<Block | IVRBlock>) => {
    updateScriptData((prevScriptData) => ({
      ...prevScriptData,
      blocks: {
        ...prevScriptData.blocks,
        [id]: {
          ...createDefaultBlock(id, prevScriptData.type),
          ...prevScriptData.blocks[id],
          ...newBlockData,
          id,
        },
      },
    }));
  }, [updateScriptData]);

  const addPage = useCallback(() => {
    const newPageId = `page_${Object.keys(scriptData.pages).length + 1}`;
    updateScriptData((prevScriptData) => ({
      ...prevScriptData,
      startPage: prevScriptData.startPage || newPageId,
      pages: {
        ...prevScriptData.pages,
        [newPageId]: {
          id: newPageId,
          title: `New Section ${Object.keys(prevScriptData.pages).length + 1}`,
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
      if (newScriptData.startPage === id) {
        newScriptData.startPage = Object.keys(newScriptData.pages)[0] ?? "";
      }
      return newScriptData;
    });
    if (currentPage === id) {
      setCurrentPage(null);
    }
  }, [updateScriptData]);

  const handleScriptChange = useCallback((value: string) => {
    if (value === `create-new-${scripts.length + 1}`) {
      navigate("../../../../scripts/new");
    } else {
      const newScript = scripts.find((script) => script.id === parseInt(value, 10));
      if (newScript) {
        updateScript(() => newScript);
        updateScriptData(() => normalizeFlow(newScript));
        setCurrentPage(getFirstPageId(normalizeFlow(newScript)));
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
          },
        },
      }));
    }
  }, [currentPage, updateScriptData]);

  const handleReorder = useCallback((draggedId: string, targetId: string, dropPosition: 'top' | 'bottom') => {
    if (!currentPage) return;
    updateScriptData((prevScriptData) => {
      const currentPageData = prevScriptData.pages[currentPage];
      if (!currentPageData) {
        return prevScriptData;
      }
      const currentPageBlocks = currentPageData.blocks;
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
            ...currentPageData,
            id: currentPage,
            title: currentPageData.title ?? "",
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

function getFirstPageId(scriptData: unknown): string | null {
  if (!isObject(scriptData)) {
    return null;
  }

  const raw = scriptData as Record<string, unknown>;
  if (!isObject(raw.pages)) {
    return null;
  }

  const pages = raw.pages as Record<string, unknown>;
  const pageValues = Object.values(pages);

  if (pageValues.length > 0) {
    const firstPage = pageValues[0];
    if (isObject(firstPage) && isString(firstPage.id)) {
      return firstPage.id || Object.keys(pages)[0] || null;
    }
  }

  return Object.keys(pages)[0] || null;
}