/**
 * Pure helpers for the issue-triage agent.
 *
 * The agent only writes `.issue-triage/triage.json`; this module turns that
 * file into the GitHub artefacts (comment body and Priority mutation) so the
 * published text is deterministic and testable without a model or network.
 */

export const TRIAGE_MARKER = "<!-- issue-triage:v1 -->";

export const PRIORITIES = ["Urgent", "High", "Medium", "Low"];
export const CONFIDENCES = ["high", "medium", "low"];

const LIMITS = {
  summary: 400,
  priorityReason: 280,
  nextStep: 400,
  listItem: 300,
  why: 240,
  missingInfo: 8,
  questions: 6,
  codeSections: 10,
};

const TOP_LEVEL_KEYS = [
  "summary",
  "priority",
  "priorityConfidence",
  "priorityReason",
  "missingInfo",
  "questions",
  "codeSections",
  "nextStep",
];

const SECTION_KEYS = ["path", "lines", "why"];

const SAFE_PATH = /^[A-Za-z0-9._$+-]+(?:\/[A-Za-z0-9._$+-]+)*$/;
const LINE_RANGE = /^\d+(?:-\d+)?$/;

function fail(message) {
  throw new Error(`issue-triage: ${message}`);
}

function readString(value, field, max) {
  if (typeof value !== "string") fail(`${field} must be a string`);
  // Collapse newlines: a multi-line value could forge the renderer's own
  // headings and verdict lines inside the published comment.
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) fail(`${field} must not be empty`);
  if (text.length > max) fail(`${field} must be ${max} characters or fewer`);
  return text;
}

function readStringList(value, field, maxItems) {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  if (value.length > maxItems) fail(`${field} must hold ${maxItems} items or fewer`);
  return value.map((item, index) => readString(item, `${field}[${index}]`, LIMITS.listItem));
}

function readCodeSections(value) {
  if (!Array.isArray(value)) fail("codeSections must be an array");
  if (value.length > LIMITS.codeSections) {
    fail(`codeSections must hold ${LIMITS.codeSections} items or fewer`);
  }
  return value.map((section, index) => {
    const label = `codeSections[${index}]`;
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      fail(`${label} must be an object`);
    }
    for (const key of Object.keys(section)) {
      if (!SECTION_KEYS.includes(key)) fail(`${label} has unknown key "${key}"`);
    }
    const path = readString(section.path, `${label}.path`, 300);
    if (path.startsWith("/") || path.includes("..") || !SAFE_PATH.test(path)) {
      fail(`${label}.path must be a repository-relative path`);
    }
    const lines =
      section.lines === undefined || section.lines === null
        ? undefined
        : readString(section.lines, `${label}.lines`, 20);
    if (lines !== undefined && !LINE_RANGE.test(lines)) {
      fail(`${label}.lines must look like "12" or "12-48"`);
    }
    return {
      path,
      lines,
      why: readString(section.why, `${label}.why`, LIMITS.why),
    };
  });
}

/**
 * Parse and strictly validate the agent's JSON. Unknown keys are rejected so a
 * schema drift fails loudly instead of silently dropping model output.
 */
export function validateTriage(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      fail(`triage.json is not valid JSON (${error.message})`);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("triage.json must be an object");
  }
  for (const key of Object.keys(parsed)) {
    if (!TOP_LEVEL_KEYS.includes(key)) fail(`triage.json has unknown key "${key}"`);
  }

  const priority = parsed.priority ?? null;
  if (priority !== null && !PRIORITIES.includes(priority)) {
    fail(`priority must be one of ${PRIORITIES.join(", ")} or null`);
  }
  const priorityConfidence = parsed.priorityConfidence;
  if (!CONFIDENCES.includes(priorityConfidence)) {
    fail(`priorityConfidence must be one of ${CONFIDENCES.join(", ")}`);
  }

  return {
    summary: readString(parsed.summary, "summary", LIMITS.summary),
    priority,
    priorityConfidence,
    priorityReason: readString(parsed.priorityReason, "priorityReason", LIMITS.priorityReason),
    missingInfo: readStringList(parsed.missingInfo ?? [], "missingInfo", LIMITS.missingInfo),
    questions: readStringList(parsed.questions ?? [], "questions", LIMITS.questions),
    codeSections: readCodeSections(parsed.codeSections ?? []),
    nextStep: readString(parsed.nextStep, "nextStep", LIMITS.nextStep),
  };
}

/**
 * Remove cited paths that do not exist and line ranges past the end of the
 * file. A hallucinated path must never become a broken link on the issue.
 */
export function verifyCodeSections(triage, { exists, lineCount }) {
  const dropped = [];
  const kept = [];
  for (const section of triage.codeSections) {
    if (!exists(section.path)) {
      dropped.push(section);
      continue;
    }
    if (section.lines) {
      const total = lineCount(section.path);
      const [start, end = start] = section.lines.split("-").map(Number);
      if (!total || start < 1 || start > total || end > total || start > end) {
        kept.push({ ...section, lines: undefined });
        continue;
      }
    }
    kept.push(section);
  }
  return { triage: { ...triage, codeSections: kept }, dropped };
}

/** A low-confidence priority is stored as a suggestion, not applied. */
export function shouldSuggest(triage) {
  return triage.priority !== null && triage.priorityConfidence === "low";
}

function codeSectionLine(section, repoUrl, ref) {
  const anchor = section.lines ? `#L${section.lines.replace("-", "-L")}` : "";
  const url = `${repoUrl}/blob/${ref}/${section.path}${anchor}`;
  const label = section.lines ? `${section.path}:${section.lines}` : section.path;
  return `- [\`${label}\`](${url}) — ${section.why}`;
}

/** Build the issue comment. Empty sections are omitted, never rendered blank. */
export function renderComment(triage, { repoUrl, ref = "dev", priorityOutcome = "unset" }) {
  const lines = [TRIAGE_MARKER, "## Triage", "", `**Summary** ${triage.summary}`, ""];

  if (!triage.priority) {
    lines.push(
      "**Priority** not set — the issue does not carry enough information to judge impact.",
      "",
      triage.priorityReason,
      "",
    );
  } else {
    let verdict;
    if (priorityOutcome === "failed") {
      verdict = `**Priority** \`${triage.priority}\` (confidence: ${triage.priorityConfidence}) — the field write failed; apply it by hand.`;
    } else if (priorityOutcome === "suggested") {
      verdict = `**Priority suggestion** \`${triage.priority}\` (confidence: ${triage.priorityConfidence}) — left for a human to apply.`;
    } else if (priorityOutcome === "set") {
      verdict = `**Priority** \`${triage.priority}\` (confidence: ${triage.priorityConfidence}) — set on the Priority field.`;
    } else {
      verdict = `**Priority** \`${triage.priority}\` (confidence: ${triage.priorityConfidence}) — not written.`;
    }
    lines.push(verdict, "", triage.priorityReason, "");
  }

  if (triage.missingInfo.length > 0) {
    lines.push("### Missing information", "");
    lines.push(...triage.missingInfo.map((item) => `- ${item}`), "");
  }

  if (triage.questions.length > 0) {
    lines.push("### Questions for the reporter", "");
    lines.push(...triage.questions.map((question, index) => `${index + 1}. ${question}`), "");
  }

  if (triage.codeSections.length > 0) {
    lines.push("### Relevant code", "");
    lines.push(...triage.codeSections.map((section) => codeSectionLine(section, repoUrl, ref)), "");
  }

  lines.push("### Suggested next step", "", triage.nextStep, "");
  lines.push(
    "<sub>Automated triage. Add the <code>skip-triage</code> label to opt out of re-runs.</sub>",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * GraphQL payload that writes the organization Issue field `Priority`.
 * GitHub records the agent's confidence and rationale on the value itself.
 *
 * Use `updateIssueFieldValue`: `setIssueFieldValue` accepts the same input and
 * returns success, but stores nothing (verified 2026-10-31 on #100).
 */
export function buildPriorityMutation({ issueId, fieldId, optionId, priorityConfidence, rationale, suggest }) {
  return {
    query: `mutation ($input: UpdateIssueFieldValueInput!) {
  updateIssueFieldValue(input: $input) {
    issue { number }
  }
}`,
    variables: {
      input: {
        issueId,
        issueField: {
          fieldId,
          singleSelectOptionId: optionId,
          confidence: priorityConfidence.toUpperCase(),
          rationale,
          suggest: Boolean(suggest),
        },
      },
    },
  };
}
