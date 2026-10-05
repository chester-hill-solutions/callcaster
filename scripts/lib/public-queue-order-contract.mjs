import ts from "typescript";
import { posix } from "node:path";
import { parseQueueWrites, stripSqlComments } from "./queue-rpc-contract.mjs";

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) {
    node = node.expression;
  }
  return node;
}

function name(node) {
  if (!node) return null;
  if (ts.isComputedPropertyName(node)) return ts.isStringLiteral(node.expression) ? node.expression.text : null;
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null;
}

function property(node) {
  node = unwrap(node);
  if (node && ts.isPropertyAccessExpression(node)) return { object: node.expression, key: node.name.text };
  if (node && ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    return { object: node.expression, key: node.argumentExpression.text };
  }
  return null;
}

function imports(source) {
  const bindings = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text.replace(/\.[cm]?[jt]s$/, "");
    const resolved = specifier.startsWith(".") ? posix.normalize(posix.join(posix.dirname(source.fileName), specifier)) : specifier;
    const module = resolved.startsWith("app/") ? "@/" + resolved.slice(4) : resolved;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly || !clause.namedBindings) continue;
    const group = clause.namedBindings;
    if (ts.isNamespaceImport(group)) bindings.set(group.name.text, { module, exported: "*" });
    else for (const item of group.elements) {
      if (!item.isTypeOnly) bindings.set(item.name.text, { module, exported: (item.propertyName ?? item.name).text });
    }
  }
  return bindings;
}

function binds(binding, target) {
  if (ts.isIdentifier(binding)) return binding.text === target;
  return binding.elements.some((element) => ts.isBindingElement(element) && binds(element.name, target));
}

function localBinding(node) {
  const target = node.text;
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope) && scope.parameters.some((parameter) => binds(parameter.name, target))) return { found: true };
    if (ts.isCatchClause(scope) && scope.variableDeclaration && binds(scope.variableDeclaration.name, target)) return { found: true };
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === target) return { found: true };
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (binds(declaration.name, target)) return { found: true, initializer: ts.isIdentifier(declaration.name) ? declaration.initializer : undefined };
      }
    }
  }
  return { found: false };
}

function resolveImport(node, bindings, seen = new Set()) {
  node = unwrap(node);
  if (!node || seen.has(node)) return null;
  seen.add(node);
  const access = property(node);
  if (access) {
    const base = resolveImport(access.object, bindings, seen);
    return base?.exported === "*" ? { module: base.module, exported: access.key } : null;
  }
  if (!ts.isIdentifier(node)) return null;
  const local = localBinding(node);
  return local.found ? resolveImport(local.initializer, bindings, seen) : bindings.get(node.text);
}

function imported(node, bindings, module, exported) {
  node = unwrap(node);
  if (node && ts.isIdentifier(node)) {
    const binding = resolveImport(node, bindings);
    return binding?.module === module && binding.exported === exported;
  }
  const access = property(node);
  if (!access || access.key !== exported) return false;
  const binding = resolveImport(access.object, bindings);
  return binding?.module === module && binding.exported === "*";
}

function localExpression(node, seen = new Set()) {
  node = unwrap(node);
  if (!node || seen.has(node)) return null;
  seen.add(node);
  if (!ts.isIdentifier(node)) return node;
  const local = localBinding(node);
  return local.initializer ? localExpression(local.initializer, seen) : node;
}

function explicitFields(node, forbidden) {
  node = unwrap(node);
  if (!node) return true;
  if (ts.isArrayLiteralExpression(node)) return node.elements.every((element) => explicitFields(element, forbidden));
  if (!ts.isObjectLiteralExpression(node)) return false;
  return node.properties.every((field) => {
    const key = name(field.name);
    return !ts.isSpreadAssignment(field) && key !== null && !forbidden.has(key);
  });
}

function enqueueOptions(node) {
  node = unwrap(node);
  if (!node) return true;
  if (!ts.isObjectLiteralExpression(node)) return false;
  return node.properties.every((field) => !ts.isSpreadAssignment(field) && ["requeue", "exec"].includes(name(field.name)));
}

function queueWrite(node, bindings) {
  node = localExpression(node);
  if (!node || !ts.isCallExpression(node)) return false;
  const method = property(node.expression);
  if (!method) return false;
  if (["insert", "update"].includes(method.key) && imported(node.arguments[0], bindings, "@/db/schema", "campaign_queue")) return true;
  return queueWrite(method.object, bindings);
}

function updateFields(arg) {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return { unknown: true };
  const fields = arg.properties.filter((field) => name(field.name) === "set");
  if (arg.properties.some(ts.isSpreadAssignment) || fields.length !== 1 || !ts.isPropertyAssignment(fields[0])) return { unknown: true };
  return { fields: fields[0].initializer };
}

function writtenFields(call, bindings) {
  const method = property(call.expression);
  if (!method) return null;
  const arg = unwrap(call.arguments[0]);
  if (["values", "set"].includes(method.key) && queueWrite(method.object, bindings)) return { fields: arg };
  if (method.key === "onConflictDoUpdate" && queueWrite(method.object, bindings)) {
    return updateFields(arg);
  }
  const table = property(localExpression(method.object));
  if (table?.key !== "campaign_queue") return null;
  if (["insert", "insertMany"].includes(method.key)) return { fields: arg };
  if (method.key !== "update") return null;
  return updateFields(arg);
}

function templateText(template, bindings) {
  if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text;
  return template.head.text + template.templateSpans.map((span) => {
    const access = property(span.expression);
    const value = imported(span.expression, bindings, "@/db/schema", "campaign_queue") ? "campaign_queue"
      : access && imported(access.object, bindings, "@/db/schema", "campaign_queue") ? access.key : "__expression";
    return value + span.literal.text;
  }).join("");
}

function sqlText(node, bindings) {
  if (ts.isTaggedTemplateExpression(node) && imported(node.tag, bindings, "drizzle-orm", "sql")) {
    return templateText(node.template, bindings);
  }
  if (!ts.isCallExpression(node)) return undefined;
  const method = property(localExpression(node.expression));
  if (method?.key !== "raw" || !imported(method.object, bindings, "drizzle-orm", "sql")) return undefined;
  const text = unwrap(node.arguments[0]);
  if (text && (ts.isStringLiteral(text) || ts.isNoSubstitutionTemplateLiteral(text))) return text.text;
  return text && ts.isTemplateExpression(text) ? templateText(text, bindings) : null;
}

/** Direct API calls and writes; dynamic options must use an explicit field list. */
export function analyzePublicQueueOrder(sources) {
  const violations = [];
  for (const { file, source } of sources) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const bindings = imports(tree);
    const report = (node, kind, message) => violations.push({ file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, kind, message });
    function visit(node) {
      if (ts.isCallExpression(node)) {
        if (imported(node.expression, bindings, "@/lib/queue.server", "enqueueContactsForCampaign") && !enqueueOptions(node.arguments[2])) {
          report(node, "forwarded-order", "Public enqueue options must be an explicit requeue/exec object; do not forward startOrder or arbitrary request options.");
        }
        if (imported(node.expression, bindings, "@/lib/db-rpc.server", "rpcHandleCampaignQueueEntry")) {
          report(node, "direct-order-write", "Public API modules cannot call the queue-entry RPC directly; use enqueueContactsForCampaign for server range reservation.");
        }
        const write = writtenFields(node, bindings);
        if (write && (write.unknown || !explicitFields(write.fields, new Set(["queue_order"])))) {
          report(node, "direct-order-write", "Public queue writes cannot set queue_order or forward unknown fields; use server range reservation.");
        }
      }
      const raw = sqlText(node, bindings);
      if (raw === null) {
        report(node, "direct-order-write", "Public raw SQL must have visible text; unknown SQL can bypass queue range reservation.");
      } else if (raw !== undefined) {
        const text = stripSqlComments(raw).replace(/'(?:[^']|'')*'/g, "''").replace(/"([a-z_][a-z0-9_]*)"/gi, "$1");
        if (/\bhandle_campaign_queue_entry\s*\(/i.test(text)) {
          report(node, "direct-order-write", "Public SQL cannot call the queue-entry RPC directly; use enqueueContactsForCampaign for server range reservation.");
        }
        const { updates, inserts, positionalInserts } = parseQueueWrites(text);
        if (positionalInserts || [...updates, ...inserts].some((write) => !write.columns.length || write.columns.some((key) => ["queue_order", "__expression"].includes(key)))) {
          report(node, "direct-order-write", "Public SQL cannot set queue_order or hide queue write columns; use server range reservation.");
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  return violations;
}
