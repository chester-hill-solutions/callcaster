# `@chester-hill-solutions/shad-cc`

Callcaster-branded React UI primitives — warm broadsheet visual language (crimson primary, sky secondary, slab typography) on **React Aria Components** and Tailwind CSS variables.

This is the **product brand package** for Callcaster. For the neutral, app-owned-theme CLI, see [`@chester-hill-solutions/ui-kit`](../ui-kit).

## Install

GitHub Packages (`.npmrc` with `@chester-hill-solutions:registry=https://npm.pkg.github.com`):

```bash
bun add @chester-hill-solutions/shad-cc react-aria-components
```

Or vendor / `file:` link (Callcaster pattern):

```json
{
  "dependencies": {
    "@chester-hill-solutions/shad-cc": "file:vendor/chester-hill-solutions/shad-cc",
    "react-aria-components": "^1.19.0"
  }
}
```

## Usage

```tsx
import { Button, Alert, Card } from "@chester-hill-solutions/shad-cc"
```

```css
@import "tailwindcss";
@import "@chester-hill-solutions/shad-cc/theme.css";
@source "../node_modules/@chester-hill-solutions/shad-cc/src";
```

Requires **Tailwind CSS v4**. Toggle dark mode with `.dark` on an ancestor (usually `<html>`).

Load **Zilla Slab** in the host app (e.g. `@fontsource/zilla-slab`). Tabac Slab ships with the package theme CSS.

## Peer dependencies

- `react` ^19
- `react-dom` ^19
- `react-aria-components` ^1

## Scripts

```bash
bun run --cwd packages/shad-cc build
bun run --cwd packages/shad-cc typecheck
```

## Source / workbench

Canonical design iteration (catalog, axe tests, docs app) lives in the `componentLiib/shad-cc` workbench. This package is the publishable extract for consumers.
