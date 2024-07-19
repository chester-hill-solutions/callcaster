
import Result from "./CallList/CallContact/Result";

const getNextStepString = (step, all) => {
    const { next } = step;
    if (!next) return 'Unknown';
    if (next === 'hangup') return 'Hang Up';

    if (next.includes(':')) {
        const [nextPageId, nextBlockId] = next.split(':');
        if (nextBlockId && all.pages[nextPageId] && all.blocks[nextBlockId]) {
            return `${all.pages[nextPageId].title} - ${all.blocks[nextBlockId].title}`;
        } else if (all.pages[nextPageId]) {
            return all.pages[nextPageId].title;
        }
    } else if (all.pages[next]) {
        return all.pages[next].title;
    }

    return 'Invalid Next Step';
};


const NextSteps = ({ data, all }) => {
    return (
        <div className="bg-gray-100 p-4 rounded-md">
            <h5 className="font-semibold mb-2 text-sm">Next Steps</h5>
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-gray-200">
                        <th className="pb-2 text-left font-semibold">Input</th>
                        <th className="pb-2 text-left font-semibold">Next Step</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((step, index) => (
                        <tr key={index} className="border-b last:border-b-0 border-gray-200">
                            <td className="py-2 pr-2 font-medium">{step.value || 'Any'}</td>
                            <td className="py-2 pl-2 break-words">
                                {getNextStepString(step, all)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const PageBlock = ({ block, data }) => {
    return (
        <div className="mb-8 last:mb-0">
            <h4 className="text-xl font-semibold mb-1 font-Zilla-Slab">{block.title}</h4>
            <div className="flex justify-between">
                <div className="w-1/2 pr-4">
                    <Result
                        action={() => null}
                        initResult={null}
                        questions={block}
                        questionId={block.id}
                    />
                    {block.type === 'synthetic' && (
                        <div>
                            <p className="text-sm">{block.audioFile}</p>
                        </div>
                    )}
                </div>
                <div className="w-1/2 pl-4">
                    <NextSteps data={block.options} all={data.campaignDetails.script.steps} />
                </div>
            </div>
        </div>
    )
};

const Page = ({ page, data }) => (
    <div className="mb-8 last:mb-0">
        <h3 className="text-2xl font-Zilla-Slab font-bold mb-2">{page.title}</h3>
        {page.blocks.map((blockId) => (
            <PageBlock
                key={blockId}
                block={data?.campaignDetails?.script?.steps.blocks[blockId]}
                data={data}
            />
        ))}
    </div>
);

export const ScriptPreview = ({ pageData }) => {
    return (
        <div className="w-full max-w-4xl mx-auto p-4">
            <h2 className="text-3xl font-bold mb-2">{pageData.campaignDetails.name}</h2>
            {Object.values(pageData.campaignDetails.script.steps.pages || {}).map((page) => (
                <Page key={page.id} page={page} data={pageData} />
            ))}
        </div>
    );
};

export default ScriptPreview;