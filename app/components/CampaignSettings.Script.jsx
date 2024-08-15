import { useCallback, useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { Button } from "./ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { useNavigate } from "@remix-run/react";
import { Toggle } from "./Inputs";
import MergedQuestionBlock from "./ScriptBlock";
import { MdRemoveCircleOutline } from "react-icons/md";

export default function CampaignSettingsScript({ pageData, onPageDataChange, scripts, mediaNames = [], scriptDefault }) {
    const [script, setScript] = useState(pageData.campaignDetails?.script);
    const [scriptData, setScriptData] = useState(pageData.campaignDetails?.script?.steps || {});
    const firstPage = Object.values(scriptData?.pages || {}).length > 0 ? Object.values(scriptData.pages)[0].id : null;
    const [currentPage, setCurrentPage] = useState(firstPage);
    const [openBlock, setOpenBlock] = useState(null);
    const navigate = useNavigate();

    const changeType = useCallback((newType) => {
        setScript(prevScript => ({
            ...prevScript,
            type: newType
        }));

        onPageDataChange(prevData => ({
            ...prevData,
            campaignDetails: {
                ...prevData.campaignDetails,
                script: {
                    ...prevData.campaignDetails.script,
                    type: newType
                }
            }
        }));
    }, [onPageDataChange]);

    const handleTitle = useCallback((event) => {
        const newTitle = event.target.value;
        setScript(prevScript => ({
            ...prevScript,
            name: newTitle
        }));
        onPageDataChange(({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                script: {
                    ...pageData.campaignDetails.script,
                    name: newTitle
                }
            }
        }));
    }, [onPageDataChange, pageData]);


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
        setOpenBlock(newBlockId)
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
                    title: `New Section ${Object.keys(scriptData.pages || {}).length + 1}`,
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

    const removeSection = (id) => {
        const newScriptData = scriptData;
        delete newScriptData.pages[id];
        setScriptData(newScriptData);
        setScript({
            ...pageData.campaignDetails.script,
            steps: newScriptData
        });
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                script: {
                    ...pageData.campaignDetails.script,
                    steps: newScriptData
                }
            }
        })
    }

    const handleScriptChange = (value) => {
        if (value === `create-new-${scripts.length + 1}`) {
            navigate('../../../../scripts/new');
        } else {
            const newScript = scripts.find(script => script.id === value);
            if (newScript) {
                setScript(newScript);
                setScriptData(newScript.steps);
                setCurrentPage(newScript.steps?.startPage || Object.values(scriptData.pages)[0].id || null);
                setOpenBlock(null);
                
                const newPageData = {
                    ...pageData,
                    campaignDetails: {
                        ...pageData.campaignDetails,
                        script_id: newScript.id,
                        script: newScript
                    }
                };
                onPageDataChange(newPageData);
            }
        }
    };


    const handleSectionNameChange = useCallback((event) => {
        const newTitle = event.target.value;
        if (currentPage) {
            const updatedScriptData = {
                ...scriptData,
                pages: {
                    ...scriptData.pages,
                    [currentPage]: {
                        ...scriptData.pages[currentPage],
                        title: newTitle
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
        }
    }, [currentPage, scriptData, pageData, onPageDataChange]);

    useEffect(() => {
        if (!script?.type){
            console.log(script, scriptDefault, scriptData)
            changeType(scriptDefault === "live_call" ? "script" : "ivr")
        }
    },[])

    const ScriptSelector = () => (
        <div className="flex flex-col">
            <div className="flex">
                <h3 className="text-lg font-Zilla-Slab">Your Scripts</h3>
            </div>
            <div className="flex">
                <Select value={script?.id} onValueChange={handleScriptChange}>
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
    )
    return (
        <div className="flex gap-4 h-full">
            <div className="w-1/4 border-r pr-4" style={{ width: "25%" }}>
                <div className="flex flex-col justify-between h-full">
                    <div>
                        <div className="text-center w-full mb-1">Sections</div>
                        <Button
                            className="w-full mb-4"
                            onClick={addPage}
                        >
                            Add Section <FaPlus size="16px" className="inline ml-2" />
                        </Button>
                        {Object.values(scriptData?.pages || {}).length > 0 && Object.values(scriptData.pages || {}).map((page) => (
                            <Button
                                key={page.id}
                                className={`w-full mb-2 justify-start  ${currentPage === page.id ? 'bg-primary text-white' : 'bg-transparent text-black border-2 border-zinc-800'}`}
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
                        {currentPage && scriptData?.pages[currentPage]?.blocks?.map((blockId) => (
                            <Button
                                key={blockId}
                                className={`w-full mb-2 justify-start ${openBlock === blockId ? 'bg-primary text-white' : 'bg-transparent text-black border-2 border-zinc-800'}`}
                                onClick={() => setOpenBlock(blockId)}
                            >
                                {scriptData?.blocks && scriptData?.blocks[blockId].title || blockId}
                            </Button>
                        ))}
                    </div>
                    <div>
                        {scripts.length > 0 && <ScriptSelector />}
                    </div>
                </div>
            </div>
            <div className="w-3/4" style={{ width: "75%" }}>
                <div className="flex flex-col">
                    <div className="flex justify-between">
                        <div className="flex flex-col">
                            <label htmlFor="campaign-name">
                                Script Name
                            </label>
                            <input
                                id="campaign-name"
                                value={script?.name || ''}
                                type="text"
                                onChange={handleTitle}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Toggle
                                name="campaign-type"
                                label="Script Type"
                                isChecked={!!script?.type ? (script?.type === 'script') : (scriptDefault === 'live_call')}
                                leftLabel="Recording/Synthetic"
                                rightLabel="Live Script"
                                onChange={(val) => changeType(!val ? 'ivr' : 'script')}
                            />
                           
                        </div>
                    </div>
                    {currentPage && (
                        <>
                            <label htmlFor="section-name" className="mt-4">
                                Section Name
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id="section-name"
                                    value={scriptData.pages[currentPage]?.title || ''}
                                    type="text"
                                    onChange={handleSectionNameChange}
                                    className="mb-4"
                                />
                                <Button onClick={() => removeSection(currentPage)} variant={'icon'}>
                                    <MdRemoveCircleOutline />
                                </Button>
                            </div>
                        </>
                    )}
                    {((scriptData.type === 'script') ?
                        (scriptData?.pages?.[currentPage]?.blocks || []).map((blockId) => (
                            <MergedQuestionBlock
                                type={scriptData.type}
                                key={blockId}
                                blocks={scriptData.blocks}
                                question={scriptData.blocks[blockId] || {}}
                                removeQuestion={() => removeBlock(blockId)}
                                moveUp={() => moveBlock(blockId, -1)}
                                moveDown={() => moveBlock(blockId, 1)}
                                onUpdate={(newState) => updateBlock(blockId, newState)}
                                openBlock={openBlock}
                                setOpenBlock={setOpenBlock}
                                dispatchState={(newState) => updateBlock(blockId, newState)}
                                scriptData={scriptData}
                                addNewBlock={addBlock}
                                handleNextChange={(optionIndex, nextValue) => {
                                    const updatedOptions = [...(scriptData.blocks[blockId]?.options || [])];
                                    if (updatedOptions[optionIndex]) {
                                        updatedOptions[optionIndex].next = nextValue;
                                        updateBlock(blockId, { options: updatedOptions });
                                    }
                                }}
                            />
                        ))
                        :
                        (currentPage && scriptData.pages[currentPage]?.blocks || []).map((blockId) => (
                            <MergedQuestionBlock
                                type={script.type}
                                key={blockId}
                                blocks={scriptData.blocks}
                                block={scriptData.blocks[blockId] || {}}
                                onRemove={() => removeBlock(blockId)}
                                onUpdate={(newState) => updateBlock(blockId, newState)}
                                onMoveDown={() => moveBlock(blockId, 1)}
                                onMoveUp={() => moveBlock(blockId, -1)}
                                openBlock={openBlock}
                                setOpenBlock={setOpenBlock}
                                pages={scriptData.pages || {}}
                                onToggle={() => setOpenBlock((curr) => curr === blockId ? null : blockId)}
                                mediaNames={mediaNames}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
