/**
 * Local ESLint rule: `callcaster/no-useless-comments` (#1936).
 *
 * A comment is for the reader, so it must carry information. Two shapes do
 * not: a comment that is only an issue/PR number (`// 1234`), and a comment
 * that is only punctuation (`// ----------`). Both are visual noise that
 * survives review because nothing flags them. This rule flags them so the
 * intent has to be written down or the comment removed.
 *
 * Informative comments are untouched: prose, a number with context
 * (`// #1936 tracks this`), a URL, or a directive (`// falls through`).
 */

/** A bare issue/PR reference: `123`, `#123`. */
const NUMBER_ONLY = /^#?\d+$/;
/** Anything with a letter or digit carries information; punctuation alone does not. */
const HAS_LETTER_OR_DIGIT = /[A-Za-z0-9]/;

/**
 * Strip the decoration ESLint leaves on a comment value: for block comments
 * every line carries a leading `*`, and line comments keep the space after
 * `//`. Returns the comment's meaningful text, trimmed.
 */
function commentText(raw) {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, "").trimEnd())
    .join("\n")
    .trim();
}

export const noUselessComments = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow comments that carry no information (issue/PR-number-only or punctuation-only).",
    },
    messages: {
      useless:
        "This comment carries no information. Remove it, or say what it means.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const text = commentText(comment.value);
          // An empty comment (`//`, `/** */`) is a different concern; skip it.
          if (text.length === 0) continue;
          if (NUMBER_ONLY.test(text) || !HAS_LETTER_OR_DIGIT.test(text)) {
            context.report({
              loc: comment.loc,
              messageId: "useless",
            });
          }
        }
      },
    };
  },
};

export default noUselessComments;
