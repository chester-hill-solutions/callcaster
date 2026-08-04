import { and, eq } from "drizzle-orm";
import { contact as contactTable } from "@/db/schema";
import { db } from "@/server/db";

/**
 * Data access for the *public*, unauthenticated survey endpoints — the loader at
 * `survey+/$surveyId` and the `survey-answer` / `survey-complete` actions.
 *
 * Separate from survey-db.server.ts on purpose: everything here is reachable
 * without a session, so the scoping and the projection are the only things
 * standing between a caller-supplied id and tenant data.
 */

/**
 * Look up a survey respondent, scoped to the survey's own workspace.
 *
 * The contact id arrives from a query string or form body, so the scope is
 * enforced in the query rather than left to each caller to remember. A foreign
 * id returns null.
 *
 * The projection is deliberately narrow: the survey page renders the given and
 * family name and echoes the id back on submit, and the two action callers only
 * need to know the row exists. Selecting the whole row would put phone, email,
 * address, voter_id, support_level and the free-form other_data blob into an
 * unauthenticated payload.
 */
export async function loadSurveyRespondentContact(
  contactId: number,
  workspaceId: string,
) {
  const [row] = await db
    .select({
      id: contactTable.id,
      firstname: contactTable.firstname,
      surname: contactTable.surname,
    })
    .from(contactTable)
    .where(
      and(
        eq(contactTable.id, contactId),
        eq(contactTable.workspace, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}
