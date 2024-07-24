import { useNavigate } from "@remix-run/react";
import { QuestionCard } from "./QuestionCard";
import { useState, useRef, useEffect, useCallback } from "react";
import { MdOutlineAddCircleOutline } from "react-icons/md";
import Result from "./CallList/CallContact/Result";

const PageBlock = ({ block, data, index }) => (
    <li className="p-4" style={{ borderTop: index > 0 ? "2px solid #ccc" : 'unset' }}>
        <div className="flex justify-between">
            <div style={{ width: "50%" }}>
                <div><h4>{block.title}</h4></div>
                <div >
                    <Result
                        action={() => null}
                        initResult={null}
                        questions={block}
                        questionId={block.id}
                    />
                </div>
            </div>
            <div style={{ width: "40%" }}>
                <NextSteps data={block.options} all={data.campaignDetails.script.steps} />
            </div>
        </div>
    </li>
);
const NextSteps = ({ data, all }) => (
    <div className="bg-gray-100 p-4 rounded-md">
        <h5 className="font-semibold mb-2">Next Steps</h5>
        <table>
            {data.map((step, index) => (
                <tr key={index} className="flex items-center">
                    <td className="w-24 font-medium">{step.content || 'Any'}:</td>
                    <td className="ml-2 text-right"><a href={`#${all.blocks[step.next]?.id}`}>{all.blocks[step.next]?.title}</a></td>
                </tr>
            ))}
        </table>
    </div>
);

const Page = ({ page, data }) => (
    <div className="flex items-center">
        <div className="h-full bg-brand-secondary p-4 flex justify-center items-center" style={{ width: "250px" }}>
            <h3 className="text-lg font-Zilla-Slab">{page.title}</h3>
        </div>
        <div className="flex flex-1">
            <ul className="flex flex-col flex-1">
                {page.blocks.length > 0 ? (
                    page.blocks.map((blockId) => (
                        <div id={blockId} key={blockId}>
                            <PageBlock
                                id={blockId}
                                key={`${page.id}-${blockId}`}
                                block={data?.campaignDetails?.script?.steps.blocks[blockId]}
                                data={data}
                            />
                        </div>
                    ))
                ) : (
                    <li className="p-4" style={{ borderTop: "2px solid #ccc" }}>
                        <h4>Page not set up</h4>
                    </li>
                )}
            </ul>
        </div>
    </div>
);

export const ScriptPreview = ({ pageData }) => {
    const [data, setData] = useState(pageData);

    const updateData = useCallback((newData) => {
        setData((prevData) => ({ ...prevData, ...newData }));
    }, []);

    return (
        <div className="relative flex flex-1 h-full overflow-auto">
            <div className="relative flex flex-wrap">
                <div className="flex flex-col">
                    {data.campaignDetails?.script?.steps?.pages &&
                        Object.values(data.campaignDetails.script.steps.pages || {}).map((page, index) => (
                            <Page key={page.id} page={page} data={data} index={index} />
                        ))}
                </div>
            </div>
        </div>
    );
};
