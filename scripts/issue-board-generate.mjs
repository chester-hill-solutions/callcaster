/**
 * Staged, atomic issue-board generation (E4.1).
 *
 * Every read and every validation happens before any write; writes go to
 * temporary siblings and are renamed into place only after the full board
 * has been built. A failure anywhere leaves the enrichment files and the
 * board exactly as they were. Injected `issues` keep this testable without
 * `gh`; `generate-open-issues-board.mjs` is the CLI wrapper.
 */
import { existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import {
  buildBoard,
  pruneClosedRecords,
  readEnrichmentFiles,
  validateEnrichmentFiles,
} from "./issue-board-lib.mjs";

function tmpPathFor(path) {
  return `${path}.tmp`;
}

function removeIfPresent(path) {
  if (existsSync(path)) unlinkSync(path);
}

export function generateIssueBoard({ enrichmentDir, output, issues, repo, projectNumber, reviewedAt }) {
  // 1–2. Read and validate the originals: a malformed file or record stops
  // here, before pruning is even computed.
  const files = readEnrichmentFiles(enrichmentDir);
  validateEnrichmentFiles(files);

  // 3–4. Prune in memory, then validate what survives (dangling blockedBy
  // edges surface here, with nothing written yet).
  const openNumbers = new Set(issues.map((issue) => issue.number));
  const { files: survivors, pruned } = pruneClosedRecords(files, openNumbers);
  const records = validateEnrichmentFiles(survivors);

  // 5. Build the complete board from the survivors.
  const { md, counts } = buildBoard({ issues, records, repo, projectNumber, reviewedAt });

  // 6–7. Stage every write next to its target, then rename. Renames are the
  // last step, so a failure while staging leaves every tracked file intact.
  const staged = [];
  try {
    for (const lane of survivors) {
      if (!lane.changed) continue;
      const tmp = tmpPathFor(lane.path);
      writeFileSync(tmp, `${JSON.stringify(lane.records, null, 2)}\n`, "utf8");
      staged.push({ tmp, target: lane.path });
    }
    const boardTmp = tmpPathFor(output);
    writeFileSync(boardTmp, md, "utf8");
    staged.push({ tmp: boardTmp, target: output });
  } catch (error) {
    for (const { tmp } of staged) removeIfPresent(tmp);
    throw error;
  }
  for (const { tmp, target } of staged) {
    renameSync(tmp, target);
  }

  return { pruned, counts, issueCount: issues.length };
}
