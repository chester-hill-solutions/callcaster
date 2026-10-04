/**
 * Compare a workspace page's read floor with its sibling action's floor.
 * Only count the standard auth strategy or an unconditional, terminating
 * hasMinRole denial before the first await. UI flags and unused calls are
 * not enforcement. Branch-specific action permissions are not page floors.
 *
 * Existing asymmetries are recorded exactly in a ratchet, not approved as
 * safe. New or weakened read gates fail; repaired entries must be removed.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const RANK = { caller: 1, member: 2, admin: 3, owner: 4 };
const ROLE_NAMES = {
  Caller: "caller",
  Member: "member",
  Admin: "admin",
  Owner: "owner",
};

function property(object, name) {
  return object?.properties.find(
    (p) => ts.isPropertyAssignment(p) && p.name.getText() === name,
  )?.initializer;
}

function containsAwait(node) {
  if (ts.isAwaitExpression(node)) return true;
  if (ts.isFunctionLike(node)) return false;
  return ts.forEachChild(node, containsAwait) === true;
}

function containsCall(node) {
  if (ts.isCallExpression(node)) return true;
  if (ts.isFunctionLike(node)) return false;
  return ts.forEachChild(node, containsCall) === true;
}

function expressionPath(node, bindings) {
  if (!node) return null;
  if (ts.isIdentifier(node)) return bindings.get(node.text) ?? null;
  if (ts.isPropertyAccessExpression(node)) {
    const base = expressionPath(node.expression, bindings);
    return base ? `${base}.${node.name.text}` : null;
  }
  return null;
}

function bindNames(pattern, source, bindings) {
  if (ts.isIdentifier(pattern)) {
    bindings.delete(pattern.text);
    if (source) bindings.set(pattern.text, source);
  } else if (ts.isObjectBindingPattern(pattern)) {
    for (const element of pattern.elements) {
      if (element.dotDotDotToken || element.initializer) continue;
      const name = element.propertyName ?? element.name;
      if (!ts.isIdentifier(name)) continue;
      bindNames(
        element.name,
        source ? `${source}.${name.text}` : null,
        bindings,
      );
    }
  }
}

function boundNames(pattern) {
  if (ts.isIdentifier(pattern)) return [pattern.text];
  if (ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern)) {
    return pattern.elements.flatMap((element) =>
      ts.isBindingElement(element) ? boundNames(element.name) : [],
    );
  }
  return [];
}

function changesAuthRole(node, bindings) {
  if (ts.isFunctionLike(node)) return false;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  ) {
    return (
      expressionPath(node.left, bindings)?.startsWith("args.auth") === true
    );
  }
  return (
    ts.forEachChild(node, (child) => changesAuthRole(child, bindings)) === true
  );
}

function terminatesDenied(statement, isRouteData) {
  const last = ts.isBlock(statement) ? statement.statements.at(-1) : statement;
  if (!last || (!ts.isThrowStatement(last) && !ts.isReturnStatement(last)))
    return false;
  const expression = last.expression;
  if (
    !expression ||
    (!ts.isCallExpression(expression) && !ts.isNewExpression(expression))
  )
    return false;
  if (ts.isNewExpression(expression)) {
    if (
      !ts.isIdentifier(expression.expression) ||
      expression.expression.text !== "Response"
    )
      return false;
  } else if (!isRouteData(expression.expression)) return false;
  const options = expression.arguments?.at(-1);
  return (
    options &&
    ts.isObjectLiteralExpression(options) &&
    property(options, "status")?.getText() === "403"
  );
}

/** Read enforcement from a handler definition, not its imports/comments. */
export function readRoleFloor(source, name) {
  const parsed = ts.createSourceFile(
    "route.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = new Map();
  const shadowed = new Set();
  for (const statement of parsed.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const binding of bindings.elements) {
      imports.set(binding.name.text, {
        name: binding.propertyName?.text ?? binding.name.text,
        module: statement.moduleSpecifier.text,
      });
    }
  }
  const isImport = (node, symbol, modules) =>
    ts.isIdentifier(node) &&
    !shadowed.has(node.text) &&
    imports.get(node.text)?.name === symbol &&
    modules.includes(imports.get(node.text)?.module);
  const role = (node) => {
    if (!node) return null;
    if (ts.isStringLiteral(node))
      return Object.hasOwn(RANK, node.text) ? node.text : null;
    if (
      ts.isPropertyAccessExpression(node) &&
      isImport(node.expression, "MemberRole", ["@/lib/member-role"])
    )
      return ROLE_NAMES[node.name.text] ?? null;
    return null;
  };
  let config;
  for (const statement of parsed.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer;
      if (
        declaration.name.getText() !== name ||
        !init ||
        !ts.isCallExpression(init)
      )
        continue;
      if (
        !isImport(
          init.expression,
          name === "loader" ? "defineLoader" : "defineAction",
          ["@/lib/handler.server"],
        )
      )
        continue;
      if (init.arguments[0] && ts.isObjectLiteralExpression(init.arguments[0]))
        config = init.arguments[0];
    }
  }
  if (!config) return null;
  const auth = property(config, "auth");
  let floor = null;
  if (
    auth &&
    (isImport(auth, "workspaceRouteAuth", ["@/lib/workspace-route.server"]) ||
      isImport(auth, "workspaceLoaderAuth", ["@/lib/workspace-route.server"]))
  )
    floor = "caller";
  if (
    auth &&
    ts.isCallExpression(auth) &&
    isImport(auth.expression, "dataPlaneSessionMinRoleAuth", [
      "@/lib/capability-guard.server",
    ])
  )
    floor = role(auth.arguments[0]);
  const handler = property(config, "handler");
  if (!handler || !ts.isArrowFunction(handler) || !ts.isBlock(handler.body))
    return floor;
  const bindings = new Map();
  if (handler.parameters[0])
    bindNames(handler.parameters[0].name, "args", bindings);
  const actorRolePath =
    auth &&
    isImport(auth, "workspaceLoaderAuth", ["@/lib/workspace-route.server"])
      ? "args.auth.ctx.userRole.role"
      : auth &&
          isImport(auth, "workspaceRouteAuth", ["@/lib/workspace-route.server"])
        ? "args.auth.userRole"
        : null;
  for (const parameter of handler.parameters) {
    for (const local of boundNames(parameter.name)) shadowed.add(local);
  }
  for (const statement of handler.body.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const local of boundNames(declaration.name)) shadowed.add(local);
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name)
      shadowed.add(statement.name.text);
  }
  for (const statement of handler.body.statements) {
    // Once async work starts, a later denial cannot prove that no read leaked.
    if (containsAwait(statement)) break;
    if (changesAuthRole(statement, bindings)) break;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        bindNames(
          declaration.name,
          statement.declarationList.flags & ts.NodeFlags.Const
            ? expressionPath(declaration.initializer, bindings)
            : null,
          bindings,
        );
      }
    }
    const call =
      ts.isIfStatement(statement) &&
      ts.isPrefixUnaryExpression(statement.expression) &&
      statement.expression.operator === ts.SyntaxKind.ExclamationToken
        ? statement.expression.operand
        : null;
    if (
      call &&
      ts.isCallExpression(call) &&
      isImport(call.expression, "hasMinRole", [
        "@/lib/member-role",
        "@/lib/workspace-route.server",
      ])
    ) {
      const actorRole = call.arguments[0];
      if (
        actorRolePath &&
        expressionPath(actorRole, bindings) === actorRolePath &&
        terminatesDenied(statement.thenStatement, (node) =>
          isImport(node, "data", ["react-router"]),
        )
      ) {
        const enforced = role(call.arguments[1]);
        if (enforced && RANK[enforced] > (RANK[floor] ?? 0)) floor = enforced;
        continue;
      }
    }
    // A promise starts work when called, even if its await occurs later.
    if (name === "loader" && containsCall(statement)) break;
  }
  return floor;
}

function actions(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory()
      ? actions(file)
      : entry.name.endsWith(".action.server.ts")
        ? [file]
        : [];
  });
}

/** Parameterized for owned fixture trees; the production CLI passes repo root. */
export function checkReadRoleFloors(root) {
  const dir = path.join(root, "app/routes/workspaces+");
  const baseline = JSON.parse(
    fs.readFileSync(
      path.join(root, "scripts/baselines/route-read-role-floor.json"),
      "utf8",
    ),
  );
  const remaining = new Map(baseline.map((entry) => [entry.route, entry]));
  if (remaining.size !== baseline.length)
    throw new Error("Duplicate read-role baseline route");
  const offenders = [];
  for (const file of actions(dir)) {
    const loader = file.replace(/\.action\.server\.ts$/, ".loader.server.ts");
    if (!fs.existsSync(loader)) continue;
    const actionFloor = readRoleFloor(fs.readFileSync(file, "utf8"), "action");
    const loaderFloor = readRoleFloor(
      fs.readFileSync(loader, "utf8"),
      "loader",
    );
    if (
      (RANK[actionFloor] ?? 0) <= 1 ||
      (RANK[actionFloor] ?? 0) <= (RANK[loaderFloor] ?? 0)
    )
      continue;
    const route = path.relative(dir, loader);
    const expected = remaining.get(route);
    if (
      expected &&
      expected.actionFloor === actionFloor &&
      expected.loaderFloor === loaderFloor &&
      expected.reason?.trim()
    )
      remaining.delete(route);
    else
      offenders.push(
        `${route}: read=${loaderFloor ?? "unproven"}, write=${actionFloor}`,
      );
  }
  for (const route of remaining.keys())
    offenders.push(
      `${route}: stale or changed read-role baseline; remove or resolve it`,
    );
  return { offenders, baselined: baseline.length };
}
