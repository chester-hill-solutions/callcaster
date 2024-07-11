import { useEffect, useMemo, useState } from "react";
import CampaignSettingsScriptQuestionBlock from "./CampaignSettings.Script.QuestionBlock";
import { FaPlus } from "react-icons/fa";
import { Button } from "./ui/button";

export default function CampaignSettingsScript({ pageData, onPageDataChange, scripts }) {
    const [scriptData, setScriptData] = useState(pageData.campaignDetails?.script.steps || {});
    const [currentPage, setCurrentPage] = useState(scriptData.startPage);
    const [openBlock, setOpenBlock] = useState(null);

    const addBlock = () => {
        const newBlockId = `block_${Object.keys(scriptData.blocks || {}).length + 1}`;
        const newBlock = {
            id: newBlockId,
            title: "New Block",
            type: "textarea",
            content: "",
            options: []
        };

        const updatedScriptData = {
            ...scriptData,
            blocks: {
                ...scriptData.blocks,
                [newBlockId]: newBlock
            },
            pages: {
                ...scriptData.pages,
                [currentPage]: {
                    ...scriptData.pages[currentPage],
                    blocks: [...(scriptData.pages[currentPage].blocks || []), newBlockId]
                }
            }
        };

        setScriptData(updatedScriptData);
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                script: {
                    ...pageData.campaignDetails.script,
                    steps: updatedScriptData
                }
            }
        });

        return newBlockId;
    };

    const removeBlock = (id) => {
        const updatedBlocks = { ...scriptData.blocks };
        delete updatedBlocks[id];

        const updatedPages = { ...scriptData.pages };
        Object.keys(updatedPages).forEach(pageId => {
            updatedPages[pageId].blocks = updatedPages[pageId].blocks.filter(blockId => blockId !== id);
        });

        const updatedScriptData = {
            ...scriptData,
            blocks: updatedBlocks,
            pages: updatedPages
        };

        setScriptData(updatedScriptData);
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                script: {
                    ...pageData.campaignDetails.script,
                    steps: updatedScriptData
                }
            }
        });
    };

    const moveBlock = (id, direction) => {
        const currentPageBlocks = scriptData.pages[currentPage].blocks;
        const currentIndex = currentPageBlocks.indexOf(id);
        if ((direction === -1 && currentIndex === 0) || (direction === 1 && currentIndex === currentPageBlocks.length - 1)) {
            return;
        }

        const newIndex = currentIndex + direction;
        const newBlocksOrder = [...currentPageBlocks];
        [newBlocksOrder[currentIndex], newBlocksOrder[newIndex]] = [newBlocksOrder[newIndex], newBlocksOrder[currentIndex]];

        const updatedScriptData = {
            ...scriptData,
            pages: {
                ...scriptData.pages,
                [currentPage]: {
                    ...scriptData.pages[currentPage],
                    blocks: newBlocksOrder
                }
            }
        };

        setScriptData(updatedScriptData);
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                script: {
                    ...pageData.campaignDetails.script,
                    steps: updatedScriptData
                }
            }
        });
    };

    const updateBlock = (id, newBlockData) => {
        const updatedScriptData = {
            ...scriptData,
            blocks: {
                ...scriptData.blocks,
                [id]: {
                    ...scriptData.blocks[id],
                    ...newBlockData
                }
            }
        };

        setScriptData(updatedScriptData);
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                script: {
                    ...pageData.campaignDetails.script,
                    steps: updatedScriptData
                }
            }
        });
    };
    
    const addPage = () => {
        const newPageId = `page_${Object.keys(scriptData.pages || {}).length + 1}`;
        const updatedScriptData = {
            ...scriptData,
            pages: {
                ...scriptData.pages,
                [newPageId]: {
                    id: newPageId,
                    title: `New Page ${Object.keys(scriptData.pages || {}).length + 1}`,
                    blocks: []
                }
            }
        };
        setScriptData(updatedScriptData);
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                script: {
                    ...pageData.campaignDetails.script,
                    steps: updatedScriptData
                }
            }
        });
        setCurrentPage(newPageId);
    };

    if (!scriptData.pages || !scriptData.blocks) {
        return <div>Error: Invalid script data</div>;
    }
    return (
        <div className="flex gap-4">
            <div className="w-1/4 border-r pr-4">
            <div className="text-center w-full mb-1">Pages</div>
                <Button
                    className="w-full mb-4"
                    onClick={addPage}
                >
                    Add Page <FaPlus size="16px" className="inline ml-2" />
                </Button>
                {Object.values(scriptData.pages).map((page) => (
                    <Button
                        key={page.id}
                        className={`w-full mb-2 justify-start bg-transparent' ${currentPage === page.id ? 'text-primary border-2 border-brand-primary': 'text-black border-2 border-zinc-800'}`}
                        onClick={() => setCurrentPage(page.id)}
                    >
                        {page.title}
                    </Button>
                ))}
                <hr className="my-4" />
                <div className="text-center w-full mb-1">Question Blocks</div>
                <Button
                    className="w-full mb-4"
                    onClick={addBlock}
                >
                    Add Block <FaPlus size="16px" className="inline ml-2" />
                </Button>
                {scriptData.pages[currentPage]?.blocks.map((blockId) => (
                    <Button
                        key={blockId}
                        className={`w-full mb-2 justify-start ${openBlock === blockId ? 'bg-brand-secondary' : ''}`}
                        onClick={() => setOpenBlock(blockId)}
                    >
                        {scriptData.blocks[blockId].title || blockId}
                    </Button>
                ))}
            </div>
            <div className="w-3/4">
                <h2 className="text-2xl font-bold mb-4">{scriptData.pages[currentPage]?.title}</h2>
                {scriptData.pages[currentPage]?.blocks.map((blockId) => (
                    <CampaignSettingsScriptQuestionBlock
                        key={blockId}
                        question={scriptData.blocks[blockId]}
                        removeQuestion={() => removeBlock(blockId)}
                        moveUp={() => moveBlock(blockId, -1)}
                        moveDown={() => moveBlock(blockId, 1)}
                        openQuestion={openBlock}
                        setOpenQuestion={setOpenBlock}
                        dispatchState={(newState) => updateBlock(blockId, newState)}
                        scriptData={scriptData}
                        addNewQuestion={addBlock}
                        handleNextChange={(optionIndex, nextValue) => {
                            const updatedOptions = [...scriptData.blocks[blockId].options];
                            updatedOptions[optionIndex].next = nextValue;
                            updateBlock(blockId, { options: updatedOptions });
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
