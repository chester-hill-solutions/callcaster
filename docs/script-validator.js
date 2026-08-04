/**
 * Script JSON validator (legacy docs helper).
 *
 * Prefer `@chester-hill-solutions/scriptkit-call-script-core` in application code:
 * `app/lib/call-script-service.ts` → `validateScriptSteps()`.
 */

function validateScriptJson(scriptJson) {
  const errors = [];
  const warnings = [];

  let script;
  try {
    script = typeof scriptJson === "string" ? JSON.parse(scriptJson) : scriptJson;
  } catch (e) {
    return { isValid: false, errors: ["Invalid JSON format: " + e.message], warnings };
  }

  if (!script || typeof script !== "object") {
    return { isValid: false, errors: ["Script must be an object with pages and blocks."], warnings };
  }

  if (!script.pages || typeof script.pages !== "object") {
    errors.push('Missing "pages" property');
  }
  if (!script.blocks || typeof script.blocks !== "object") {
    errors.push('Missing "blocks" property');
  }

  if (errors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  return { isValid: true, errors, warnings };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { validateScriptJson };
}
