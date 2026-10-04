import ts from "typescript";

const SHEET_MODULE = /(?:^|\/)ui\/sheet(?:\.[jt]sx?)?$/;
const SLOTS = new Map([
  ["SheetContent", "content"],
  ["SheetPanel", "content"],
  ["SheetBody", "body"],
  ["SheetHeader", "header"],
  ["SheetFooter", "footer"],
]);

function importedSlots(source) {
  const slots = new Map();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    if (!SHEET_MODULE.test(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      for (const [name, slot] of SLOTS)
        slots.set(`${bindings.name.text}.${name}`, slot);
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        const slot = SLOTS.get((binding.propertyName ?? binding.name).text);
        if (slot) slots.set(binding.name.text, slot);
      }
    }
  }
  return slots;
}

function bodyPaddingOverrides(element) {
  return element.attributes.properties.filter((attribute) => {
    if (!ts.isJsxAttribute(attribute)) return true;
    const value = attribute.initializer;
    if (attribute.name.text === "className") {
      if (!value || !ts.isStringLiteral(value)) return true;
      return value.text
        .split(/\s+/)
        .some((token) =>
          /(?:^|:)!?p[xysetblr]?-[^\s]+$|(?:^|:)!?\[padding(?:-[a-z-]+)?:/.test(
            token,
          ),
        );
    }
    if (attribute.name.text === "style") {
      if (
        !value ||
        !ts.isJsxExpression(value) ||
        !value.expression ||
        !ts.isObjectLiteralExpression(value.expression)
      )
        return true;
      return value.expression.properties.some(
        (property) =>
          !ts.isPropertyAssignment(property) ||
          ts.isComputedPropertyName(property.name) ||
          /^padding/i.test(property.name.getText().replace(/["']/g, "")),
      );
    }
    if (attribute.name.text === "inset")
      return (
        !value ||
        !ts.isStringLiteral(value) ||
        !["default", "none", "navigation"].includes(value.text)
      );
    return false;
  });
}

export function checkSheetBodyContract(text, file = "consumer.tsx") {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const slots = importedSlots(source);
  const errors = [];
  const fail = (node, message) => {
    const { line } = source.getLineAndCharacterOfPosition(
      node.getStart(source),
    );
    errors.push({ file, line: line + 1, message });
  };
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "@chester-hill-solutions/shad-cc/sheet"
    ) {
      fail(
        statement,
        "Import sheets from the local ui/sheet adapter so the body contract applies.",
      );
    }
  }
  const opening = (node) =>
    ts.isJsxElement(node) ? node.openingElement : node;
  const slotOf = (node) => slots.get(opening(node).tagName.getText(source));
  const childrenOf = (node) => (ts.isJsxElement(node) ? node.children : []);

  function checkBody(node) {
    for (const attribute of bodyPaddingOverrides(opening(node))) {
      fail(
        attribute,
        "SheetBody owns padding. Use a literal inset variant and static layout classes without padding overrides or spread props.",
      );
    }
    function visit(child) {
      if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
        const slot = slotOf(child);
        if (slot === "header" || slot === "footer" || slot === "body") {
          fail(
            child,
            "Keep sheet header, footer and nested bodies outside SheetBody to avoid doubled inset.",
          );
          return;
        }
        if (slot === "content") return;
      }
      ts.forEachChild(child, visit);
    }
    childrenOf(node).forEach(visit);
  }

  function checkContent(content) {
    let bodyCount = 0;
    function child(node) {
      if (ts.isJsxText(node)) {
        if (node.text.trim())
          fail(node, "Put sheet body text inside SheetBody.");
      } else if (ts.isJsxExpression(node)) {
        if (node.expression) expression(node.expression);
      } else if (ts.isJsxFragment(node)) {
        node.children.forEach(child);
      } else if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const slot = slotOf(node);
        if (slot === "body") {
          bodyCount += 1;
          checkBody(node);
        } else if (slot !== "header" && slot !== "footer") {
          const element = opening(node);
          const name = element.tagName.getText(source);
          const hiddenInput =
            name === "input" &&
            element.attributes.properties.some(
              (p) =>
                ts.isJsxAttribute(p) &&
                p.name.text === "type" &&
                p.initializer &&
                ts.isStringLiteral(p.initializer) &&
                p.initializer.text === "hidden",
            );
          if (name === "form" || name === "Form")
            childrenOf(node).forEach(child);
          else if (!hiddenInput)
            fail(
              node,
              'Put sheet body content inside SheetBody; use inset="none" only for an intentional edge-to-edge body.',
            );
        }
      }
    }
    function expression(node) {
      if (ts.isParenthesizedExpression(node)) expression(node.expression);
      else if (ts.isConditionalExpression(node)) {
        expression(node.whenTrue);
        expression(node.whenFalse);
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      )
        expression(node.right);
      else if (
        ts.isJsxElement(node) ||
        ts.isJsxSelfClosingElement(node) ||
        ts.isJsxFragment(node)
      )
        child(node);
      else if (
        node.kind !== ts.SyntaxKind.NullKeyword &&
        node.kind !== ts.SyntaxKind.FalseKeyword &&
        node.kind !== ts.SyntaxKind.TrueKeyword &&
        !(ts.isIdentifier(node) && node.text === "undefined")
      ) {
        fail(node, "Put dynamic sheet body content inside SheetBody.");
      }
    }
    childrenOf(content).forEach(child);
    if (!bodyCount)
      fail(
        content,
        "Declare a SheetBody for this sheet, including explicit edge-to-edge bodies.",
      );
  }

  function visit(node) {
    if (
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
      slotOf(node) === "content"
    )
      checkContent(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return errors;
}
