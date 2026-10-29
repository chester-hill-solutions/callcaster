import ts from "typescript";

const METHOD_SCOPES = new Map(
  Object.entries({
    signUpEmail: ["auth:register"],
    signInEmail: ["auth:sign-in"],
    resetPassword: ["auth:reset-password"],
    requestPasswordReset: ["auth:forgot-password"],
    changePassword: ["auth:sign-in"],
    verifyEmail: ["auth:verify-email"],
    verifyEmailOTP: ["auth:verify-email"],
    verifyTOTP: ["auth:sign-in", "2fa:verify"],
    verifyOTP: ["auth:sign-in"],
    verifyBackupCode: ["auth:sign-in"],
  }),
);
const HELPER_SCOPES = new Map(
  Object.entries({
    loginWithPassword: ["auth:sign-in"],
    tokenLogin: ["auth:sign-in"],
    registerUser: ["auth:register"],
    forgotPassword: ["auth:forgot-password"],
    resetPassword: ["auth:reset-password"],
    verifyEmailOtp: ["auth:verify-email"],
  }),
);

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}
function literal(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function unwrap(node) {
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isSatisfiesExpression(node))
  )
    node = node.expression;
  return node;
}

/** Read declarations and actual calls; comments cannot satisfy a policy. */
export function analyzeAuthRateLimitSource(source, filename) {
  const ast = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const helperScopes = new Map(HELPER_SCOPES);
  const authNames = new Set(["auth"]);
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const imports = statement.importClause?.namedBindings;
    if (!imports || !ts.isNamedImports(imports)) continue;
    for (const specifier of imports.elements) {
      const original = specifier.propertyName?.text ?? specifier.name.text;
      if (
        literal(statement.moduleSpecifier)?.endsWith("platform-auth.server") &&
        HELPER_SCOPES.has(original)
      )
        helperScopes.set(specifier.name.text, HELPER_SCOPES.get(original));
      if (
        literal(statement.moduleSpecifier)?.endsWith("auth-instance") &&
        original === "auth"
      )
        authNames.add(specifier.name.text);
    }
  }
  const apiObjects = new Set([...authNames].map((name) => `${name}.api`));
  const bindings = new Map();
  const declarations = new Map();
  walk(ast, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) return;
    declarations.set(
      node.name.text,
      declarations.has(node.name.text) ? undefined : node.initializer,
    );
    if (!(node.parent.flags & ts.NodeFlags.Const)) return;
    const initializer = unwrap(node.initializer);
    if (initializer && apiObjects.has(initializer.getText(ast)))
      apiObjects.add(node.name.text);
    const value = literal(node.initializer);
    if (value === undefined) return;
    const values = bindings.get(node.name.text) ?? new Set();
    values.add(value);
    bindings.set(node.name.text, values);
  });
  function resolveLiteral(node) {
    if (node && ts.isIdentifier(node)) {
      const values = bindings.get(node.text);
      return values?.size === 1 ? [...values][0] : undefined;
    }
    return literal(node);
  }

  const hits = new Map();
  const declared = [];
  let hasLimiter = false;
  let hasHandler = false;
  let usesEndpointPolicy = false;
  let strictDefault = false;
  walk(ast, (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(ast);
      const expression = node.expression;
      const apiObject = ts.isPropertyAccessExpression(expression)
        ? unwrap(expression.expression)
        : undefined;
      const scope =
        apiObject && apiObjects.has(apiObject.getText(ast))
          ? METHOD_SCOPES.get(expression.name.text)
          : helperScopes.get(callee);
      if (scope) hits.set(callee, scope);
      if ([...authNames].some((name) => callee === `${name}.handler`))
        hasHandler = true;
      if (
        callee === "enforceAuthRateLimit" ||
        callee === "rateLimitedPostAuth" ||
        callee === "enforceTwoFactorSetupRateLimit"
      ) {
        hasLimiter = true;
        const argument =
          node.arguments[callee === "rateLimitedPostAuth" ? 0 : 1];
        const value = resolveLiteral(argument);
        if (value !== undefined)
          declared.push({
            scope: value,
            family:
              callee === "enforceTwoFactorSetupRateLimit" ? "2fa" : "auth",
          });
        if (
          argument &&
          ts.isCallExpression(argument) &&
          argument.expression.getText(ast) === "rateLimitScopeForAuthPath"
        )
          usesEndpointPolicy = true;
      }
    }
    if (
      !ts.isFunctionDeclaration(node) ||
      node.name?.text !== "rateLimitScopeForAuthPath"
    )
      return;
    walk(node, (child) => {
      if (!ts.isReturnStatement(child) || !child.expression) return;
      const expression = child.expression;
      if (
        ts.isBinaryExpression(expression) &&
        expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
        literal(expression.right) === "auth:sign-in" &&
        ts.isElementAccessExpression(expression.left) &&
        expression.left.expression.getText(ast) === "AUTH_OPERATION_SCOPES"
      )
        strictDefault = true;
    });
  });

  const operationScopes = new Map();
  let validOperationTable = false;
  const table = declarations.get("AUTH_OPERATION_SCOPES");
  if (table && ts.isObjectLiteralExpression(table)) {
    validOperationTable = true;
    for (const property of table.properties) {
      if (!ts.isPropertyAssignment(property)) {
        validOperationTable = false;
        continue;
      }
      const name = literal(property.name);
      const value = literal(property.initializer);
      if (name !== undefined && value !== undefined)
        operationScopes.set(name, value);
      else validOperationTable = false;
    }
  }
  const sessionPaths = new Set();
  const set = declarations.get("SESSION_LIFECYCLE_PATHS");
  if (set && ts.isNewExpression(set) && set.expression.getText(ast) === "Set") {
    const array = set.arguments?.[0];
    if (array && ts.isArrayLiteralExpression(array)) {
      for (const element of array.elements) sessionPaths.add(literal(element));
    }
  }
  return {
    hits: [...hits].map(([call, scopes]) => ({ call, scopes })),
    declared,
    hasLimiter,
    hasHandler,
    usesEndpointPolicy,
    strictDefault,
    validOperationTable,
    operationScopes,
    sessionPaths,
  };
}
