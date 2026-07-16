import { beforeEach, describe, expect, test, vi } from "vitest";
// NOTE: these table objects must be imported *after* the per-test
// `vi.resetModules()` (inside `beforeEach`, not at module top-level).
// `survey-db.server.ts` is re-imported dynamically per test too, and with
// `resetModules()` in between, a top-level static import here would resolve
// to a *different* module registry entry than the one `survey-db.server.ts`
// sees internally — the tables would `!==` each other despite being "the
// same" schema export, and every `txInsert`/`txDelete` table-identity check
// below would silently miss.

// Regression coverage for audit-C 2b: `handleUpdateSurvey` (app/routes/api+/
// surveys.action.server.ts) only ever passed `title`/`is_active` to
// `updateSurveyMetadata`, so the edit page's full page/question/option editor
// was decorative — any structural edit vanished silently on save even though
// the PATCH returned `{success:true}`.
//
// `updateSurveyMetadata` now accepts an optional `pages` array and, when
// present, syncs survey_page/survey_question/question_option to match it
// (upserting on the live schema's real unique constraints and deleting
// anything no longer present). This proves the *persistence layer* fix in
// isolation from the not-yet-wired `api+/surveys.action.server.ts` caller
// (see the final report for that remaining wiring gap — that file is outside
// this agent's owned scope).
//
// Falsification: dropping the `if (!survey || !args.pages) return survey;`
// early-return's structural-sync branch (i.e. reverting to the original
// title/is_active-only behavior) makes every assertion below that checks
// survey_page/survey_question/question_option inserts fail, since those
// tables would never be touched.

function makeChain(returning: unknown[] = []) {
  const chain: Record<string, unknown> & {
    then: (resolve: (v: unknown) => void) => void;
  } = {
    then: (resolve) => resolve(undefined),
  } as never;
  chain.values = vi.fn(() => chain);
  chain.onConflictDoUpdate = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn(async () => returning);
  return chain;
}

describe("updateSurveyMetadata: structural sync (audit-C 2b)", () => {
  const surveyRow = { id: 960001, survey_id: "e2e-survey-public", title: "New Title", is_active: true };
  const pageRow = { id: 960101, survey_id: 960001, page_id: "page1" };
  const q1Row = { id: 960201, page_id: 960101, question_id: "q1" };
  const q3Row = { id: 960203, page_id: 960101, question_id: "q3" };

  let tdbUpdate: ReturnType<typeof vi.fn>;
  let txInsert: ReturnType<typeof vi.fn>;
  let txDelete: ReturnType<typeof vi.fn>;
  let surveyPageTable: unknown;
  let surveyQuestionTable: unknown;
  let questionOptionTable: unknown;

  beforeEach(async () => {
    vi.resetModules();

    const schema = await import("@/db/schema");
    surveyPageTable = schema.survey_page;
    surveyQuestionTable = schema.survey_question;
    questionOptionTable = schema.question_option;

    tdbUpdate = vi.fn(async () => [surveyRow]);

    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => ({
        survey: { update: tdbUpdate },
      })),
    }));

    txInsert = vi.fn((table: unknown) => {
      if (table === surveyPageTable) return makeChain([pageRow]);
      if (table === surveyQuestionTable) {
        // First insert call for survey_question is q1 (existing, edited),
        // second is q3 (brand new). Order matches the `pages[0].questions`
        // array in the test payload below.
        const returning = txInsert.mock.calls.filter(([t]) => t === surveyQuestionTable).length === 0
          ? [q1Row]
          : [q3Row];
        return makeChain(returning);
      }
      if (table === questionOptionTable) return makeChain([{ id: 1 }]);
      throw new Error(`Unexpected insert table in test: ${String(table)}`);
    });

    txDelete = vi.fn(() => makeChain());

    vi.doMock("@/server/db", () => ({
      db: {
        transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ insert: txInsert, delete: txDelete }),
        ),
      },
    }));

    vi.doMock("@/lib/logger.server", () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
  });

  test("syncs edited/added/removed pages, questions, and options", async () => {
    const { updateSurveyMetadata } = await import("@/lib/survey-db.server");

    const result = await updateSurveyMetadata({
      workspaceId: "a0000000-0000-4000-8000-000000000001",
      surveyPublicId: "e2e-survey-public",
      title: "New Title",
      is_active: true,
      pages: [
        {
          page_id: "page1",
          title: "Page 1 (renamed)",
          page_order: 1,
          questions: [
            {
              // existing question, text edited
              question_id: "q1",
              question_text: "How are you feeling today?",
              question_type: "radio",
              is_required: true,
              question_order: 1,
              options: [
                { option_value: "good", option_label: "Good", option_order: 1 },
                { option_value: "bad", option_label: "Bad", option_order: 2 },
              ],
            },
            {
              // brand new question — did not exist before this edit
              question_id: "q3",
              question_text: "Anything else?",
              question_type: "text",
              is_required: false,
              question_order: 2,
              options: [],
            },
            // note: the previously-existing "q2" question is intentionally
            // absent here, simulating the user deleting it in the editor.
          ],
        },
      ],
    });

    expect(result).toEqual(surveyRow);

    // Metadata still gets updated as before.
    expect(tdbUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ title: "New Title", is_active: true }),
      }),
    );

    // The page is upserted (not silently dropped).
    expect(txInsert).toHaveBeenCalledWith(surveyPageTable);
    const pageInsertCall = txInsert.mock.results.find((_, i) => txInsert.mock.calls[i][0] === surveyPageTable);
    expect(pageInsertCall).toBeDefined();

    // Both the edited existing question and the newly-added question are
    // upserted into survey_question — this is exactly the data the old
    // `updateSurveyMetadata` silently discarded.
    const questionInsertCalls = txInsert.mock.calls.filter(([t]) => t === surveyQuestionTable);
    expect(questionInsertCalls).toHaveLength(2);

    // The removed question ("q2") triggers a delete against survey_question
    // scoped to the page, not a silent no-op.
    expect(txDelete).toHaveBeenCalledWith(surveyQuestionTable);

    // Options for the edited question are synced too.
    const optionInsertCalls = txInsert.mock.calls.filter(([t]) => t === questionOptionTable);
    expect(optionInsertCalls).toHaveLength(2);
  });

  test("metadata-only calls (no `pages`) do not touch survey_page/question/option — back-compat", async () => {
    const { updateSurveyMetadata } = await import("@/lib/survey-db.server");

    await updateSurveyMetadata({
      workspaceId: "a0000000-0000-4000-8000-000000000001",
      surveyPublicId: "e2e-survey-public",
      title: "New Title",
      is_active: true,
    });

    expect(txInsert).not.toHaveBeenCalled();
    expect(txDelete).not.toHaveBeenCalled();
  });
});
