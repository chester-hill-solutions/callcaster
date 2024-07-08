import { useEffect, useMemo, useState } from "react";
import CampaignSettingsScriptQuestionBlock from "./CampaignSettings.Script.QuestionBlock";
import { FaPlus } from "react-icons/fa";

export default function CampaignSettingsScript({ pageData, onPageDataChange }) {
    const [blocks, setBlocks] = useState(pageData.campaignDetails?.questions?.blocks || {})
    const [openQuestion, setOpenQuestion] = useState(null);
    const blockOrder = useMemo(() => {
        return Object.keys(blocks).sort((a, b) => Number(a) - Number(b))
    }, [blocks])
    const addQuestion = async () => {
        const newBlocks = { ...blocks };
        const newBlockId = Math.max(...Object.keys(newBlocks).map(Number), 0) + 1;
        const newQuestion = {
            id: `new-question-${newBlockId}`,
            title: "",
            type: "textarea",
            content: "",
            options: [{ next: 0 }]
        };

        newBlocks[newBlockId] = newQuestion;

        Object.values(newBlocks).forEach((block) => {
            block.options = block?.options?.map(option => ({
                ...option,
                next: option.next === 0 ? newBlockId : option.next
            })) || [];

        });
        setBlocks(newBlocks);
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                questions: {
                    ...pageData.campaignDetails.questions,
                    blocks: newBlocks
                }
            }
        });

        return newBlockId;
    };

    const removeQuestion = (id) => {
        const newBlocks = { ...blocks };
        delete newBlocks[id];

        Object.values(newBlocks).forEach((block) => {
            block.options = block?.options?.map(option => ({
                ...option,
                next: option.next === Number(id) ? 0 : option.next
            })) || [];
        });

        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                questions: {
                    ...pageData.campaignDetails.questions,
                    blocks: newBlocks
                }
            }
        });
        setBlocks(newBlocks);
    };

    const moveQuestion = (id, direction) => {
        const blockIds = Object.keys(blocks).map(Number).sort((a, b) => a - b);
        const currentIndex = blockIds.indexOf(Number(id));
        if ((direction === -1 && currentIndex === 0) || (direction === 1 && currentIndex === blockIds.length - 1)) {
            return;
        }
        const targetIndex = currentIndex + direction;
        const targetId = blockIds[targetIndex];

        const newBlocks = { ...blocks };
        [newBlocks[id], newBlocks[targetId]] = [newBlocks[targetId], newBlocks[id]];

        Object.values(newBlocks).forEach((block) => {
            block.options = block?.options.map(option => ({
                ...option,
                next: option.next === Number(id) ? Number(targetId) :
                    option.next === Number(targetId) ? Number(id) :
                        option.next
            }));
        });

        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                questions: {
                    ...pageData.campaignDetails.questions,
                    blocks: newBlocks
                }
            }
        });
        setBlocks(newBlocks);
    };

    const dispatchState = (id, newState) => {
        const updatedBlocks = { ...blocks, [id]: newState };
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                questions: {
                    ...pageData.campaignDetails.questions,
                    blocks: updatedBlocks
                }
            }
        });
        setBlocks(updatedBlocks);
    };

    const handleNextChange = (questionId, optionIndex, nextValue) => {
        const updatedBlocks = { ...blocks };
        const question = updatedBlocks[questionId];
        if (question) {
            question.options[optionIndex].next = Number(nextValue);
        }
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                questions: {
                    ...pageData.campaignDetails.questions,
                    blocks: updatedBlocks
                }
            }
        });
        setBlocks(updatedBlocks);
    };

    return (
        <div>
            <div className="flex gap-2 px-2 my-1">
                <div className="flex flex-col" style={{
                    flex: '1 1 20%',
                    border: "3px solid #BCEBFF",
                    borderRadius: "20px",
                    minHeight: "300px"
                }}>
                    <button className="bg-primary text-white font-Zilla-Slab text-xl px-2 py-2 gap-2" onClick={addQuestion} style={{ justifyContent: 'center', display: "flex", alignItems: "center", borderTopLeftRadius: "18px", borderTopRightRadius: "18px" }}>
                        Add Question<FaPlus size="16px" />
                    </button>
                    {blockOrder.map((id) => {
                        const question = blocks[id]
                        return <button
                            key={id}
                            onClick={() => setOpenQuestion(question.id)}
                            style={{ textAlign: 'left', border: "1px solid #f1f1f1" }}
                            className={`px-2 hover:bg-accent ${openQuestion === question.id && 'bg-brand-secondary'}`}
                        >
                            {question.title || question.id}
                        </button>
                    })}
                </div>
                <div className="flex flex-col" style={{ flex: '1 1 60%' }}>
                    {blockOrder.map((id) => {
                        const question = blocks[id];
                        return <CampaignSettingsScriptQuestionBlock
                            key={id}
                            question={question}
                            removeQuestion={() => removeQuestion(id)}
                            moveUp={() => moveQuestion(id, -1)}
                            moveDown={() => moveQuestion(id, 1)}
                            openQuestion={openQuestion}
                            setOpenQuestion={setOpenQuestion}
                            dispatchState={(newState) => dispatchState(id, newState)}
                            allQuestions={Object.entries(blocks)}
                            addNewQuestion={addQuestion}
                            handleNextChange={handleNextChange}
                        />
                    })}
                </div>
            </div>
        </div>
    );
}