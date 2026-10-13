# Redirect Target Checks

`npm run check:redirect-targets` is a source-validation guard. It compares
literal local redirects with the registered React Router route tree. It is not
a replacement for runtime or end-to-end tests.

## What it checks

- Parent, pathless, index, parameter, and wildcard routes are matched through
  React Router's route matcher.
- Query strings and hashes do not change the target page.
- All registered route modules are scanned, including the root module.
- Static imports and re-exports are followed within `app/routes/` and for
  direct `app/` siblings such as the root loader. Directory index modules are
  resolved too.
- Imported assets are excluded from script discovery.
- Named `redirect` and `redirectDocument` imports, aliases, namespace imports,
  multiline calls, and literal templates are supported.
- Lexical bindings keep shadowed names, comments, and string examples out of
  the check.

An absent literal local target fails the check. There is no suppression
baseline.

## What it does not check

The guard does not validate runtime-computed arguments, interpolated templates,
dynamic imports, or helpers outside the supported source boundaries. External
URLs and other non-absolute references remain unchecked. An auth wildcard
proves route registration, not whether Better Auth accepts that endpoint.

Keep runtime and end-to-end checks for those cases. The relative-redirect gate
is separate; both gates run in full local CI and the quality workflow.

## CLI behavior

Normal CI reads the current registered tree from:

```bash
react-router routes --json
```

The command fails on empty output or a missing registered source file. Tests
can provide an isolated route tree with:

```bash
npm run check:redirect-targets -- --routes-json <file>
```
