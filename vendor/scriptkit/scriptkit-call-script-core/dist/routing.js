export function evaluateRouting(doc, answers, startPageId = doc.startPageId) {
    const answerMap = new Map(answers.map((a) => [a.blockId, a.value]));
    let pageId = startPageId;
    const visited = new Set();
    while (pageId && !visited.has(pageId)) {
        visited.add(pageId);
        const page = doc.pages[pageId];
        if (!page) {
            return { nextPageId: null, nextBlockId: null, complete: true };
        }
        for (const blockId of page.blockIds) {
            const block = doc.blocks[blockId];
            if (!block) {
                continue;
            }
            if (block.type === "instruction") {
                continue;
            }
            const value = answerMap.get(blockId);
            if (value === undefined) {
                return { nextPageId: pageId, nextBlockId: blockId, complete: false };
            }
            const rule = block.routingRules?.find((r) => r.answerValue === value);
            if (rule?.targetPageId) {
                pageId = rule.targetPageId;
                break;
            }
            if (rule?.targetBlockId) {
                return { nextPageId: pageId, nextBlockId: rule.targetBlockId, complete: false };
            }
        }
        if (!page.blockIds.some((id) => answerMap.get(id) === undefined)) {
            return { nextPageId: null, nextBlockId: null, complete: true };
        }
    }
    return { nextPageId: null, nextBlockId: null, complete: true };
}
