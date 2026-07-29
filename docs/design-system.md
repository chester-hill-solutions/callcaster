# Design System Usage

This project uses the Callcaster-branded **`@chester-hill-solutions/shad-cc`** design system (React Aria Components + Tailwind v4), with thin Radix-compat adapters under [`app/components/ui/`](app/components/ui/).

For a full inventory of components, static assets, icons, route surfaces, and known redundancies, see [design-system-audit.md](design-system-audit.md).

## Package source

| Layer | Location |
|-------|----------|
| Published package | `@chester-hill-solutions/shad-cc` (CHS monorepo `packages/shad-cc`) |
| Vendored in-app | [`vendor/chester-hill-solutions/shad-cc`](../vendor/chester-hill-solutions/shad-cc) |
| Theme tokens | `@chester-hill-solutions/shad-cc/theme.css` (imported from [`app/tailwind.css`](../app/tailwind.css)) |
| Design workbench | `componentLiib/shad-cc` (catalog + axe tests) |

Neutral CHS apps that own their own theme should use [`@chester-hill-solutions/ui-kit`](https://github.com/chester-hill-solutions/chester-hill-solutions/tree/main/packages/ui-kit) instead.

## Primitives

- **Import from [`app/components/ui/`](app/components/ui/).** Most files re-export or adapt `@chester-hill-solutions/shad-cc/*`. Prefer `Input`, `Select`, `Textarea`, `Label`, `Checkbox`, `Switch`, `Button`, `Card`, `Table`, `Badge`, `Alert`, `Dialog`, `Sheet`, `Tabs`, `Pagination`, etc.
- **Compatibility:** Call sites may keep Radix-shaped props (`disabled`, `checked`, `value`/`onValueChange`, `asChild`). Adapters map these onto React Aria (`isDisabled`, `isSelected`, `selectedKey`, etc.).
- **Typography:** Use `Heading` and `Text` from [app/components/ui/typography.tsx](app/components/ui/typography.tsx) for titles and body copy. Use the `branded` variant where the app’s Zilla Slab look is desired. Legacy classes `font-Zilla-Slab` / `font-Tabac-Slab` still resolve via `@theme` aliases to `font-heading` / `font-brand`.
- **Loading:** Use `Skeleton` from [app/components/ui/skeleton.tsx](app/components/ui/skeleton.tsx) for table rows, cards, and form placeholders while data loads.

## Form layout

- **Use `FormField`** from [app/components/ui/form-field.tsx](app/components/ui/form-field.tsx) for every form field. It provides label, optional description, optional error message, and consistent spacing. Put the control (Input, Select, Textarea, Switch, etc.) as the child of `FormField`.

## Page structure

- **Auth flows:** Use `AuthCard` from [app/components/shared/AuthCard.tsx](app/components/shared/AuthCard.tsx) for signin, signup, password reset, and invite acceptance. It provides a centered card with branded title and description slot.
- **Settings and creation:** Use `Section` and `SectionHeader` from [app/components/shared/Section.tsx](app/components/shared/Section.tsx) for settings blocks and creation flows. Use `SectionHeader` for title + optional description + actions. Inside the workspace panel, pass `variant="flat"` explicitly.
- **In-panel creation:** Use `PageShell` (`maxWidth="narrow"`) + flat `Section`s for campaign/audience/script/audio creation nested under `/workspaces/:id`. Reserve `BrandedCard` for standalone flows outside the workspace panel (auth, invite, marketing).
- **List empty states:** Use `WorkspaceResourceListShell` / `WorkspaceResourceEmptyState` — flat heading, description, illustration, and action with no Card chrome.
- **Branded cards:** For standalone wizards that need the Zilla Slab title and actions layout outside the workspace panel, use `BrandedCard`, `BrandedCardTitle`, `BrandedCardContent`, `BrandedCardActions` from [app/components/shared/BrandedCard.tsx](app/components/shared/BrandedCard.tsx) (or the re-exports via `CustomCard` for backward compatibility).

## Tables and pagination

- **Tables:** Use [app/components/workspace/tables/DataTable.tsx](app/components/workspace/tables/DataTable.tsx) with TanStack Table for data grids. It supports optional toolbar, loading skeleton rows, custom empty state, and optional pagination.
- **Pagination:** Use [app/components/shared/TablePagination.tsx](app/components/shared/TablePagination.tsx) as the single pagination composition. Queue and other list screens use it (e.g. via `QueueTablePagination`).

## Toasts

- **One Toaster:** The app mounts a single `<Toaster />` (sonner) in [app/root.tsx](app/root.tsx). Do not mount `<Toaster />` in routes.
- **Usage:** `import { toast } from "sonner"` and call `toast.success()`, `toast.error()`, etc. as needed.

## Icons

- **Use `lucide-react` for new code.** Prefer Lucide icons in primitives, navigation, and new features.
- **Legacy `react-icons`** remains in some campaign, nav, and SMS surfaces — migrate opportunistically when touching those files.
- **Exception:** [`Result.IconMap.tsx`](app/components/call-list/records/participant/Result.IconMap.tsx) maps call disposition names to Material Design icons; keep as a documented domain exception.

## Deprecated / legacy

- **CustomCard:** Prefer `ui/card` or the branded components from `BrandedCard`. `CustomCard` is a thin re-export of `BrandedCard` for backward compatibility; all production imports have been migrated to `BrandedCard` (0 `CustomCard` imports remain — the alias is a candidate for deletion). New code should use `BrandedCard` or plain `ui/card` where appropriate.
- **forms/Inputs:** Removed. Use `ui/input`, `ui/select`, `ui/datetime`, `ui/switch` with `FormField` instead. Feature-specific components in `forms/` (e.g. `AudioSelector`) remain.

## Tokens

- Prefer semantic tokens: `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `bg-brand-primary`, etc. Token source of truth is `@chester-hill-solutions/shad-cc/theme.css` (full `hsl(...)` values — use `var(--token)`, not `hsl(var(--token))`).
- **Status tokens:** `success` / `warning` / `info` / `destructive` are defined in the shad-cc theme. `Badge` and `Alert` consume them.
- **Tailwind:** v4 via `@tailwindcss/vite`. Entry stylesheet is [`app/tailwind.css`](../app/tailwind.css).

## Design north star

### Portable principles

Product-agnostic work-surface rules (one surface owner, depth budget, character vs work, chrome ownership, progressive disclosure, positive copy) live in [`.agents/skills/work-surface-design/SKILL.md`](../.agents/skills/work-surface-design/SKILL.md). Use that skill for unrelated apps; the subsections below are CallCaster’s local mapping (workspace panel, `Section` flat, Tabac/Zilla, etc.).

### Character vs work surfaces

Reserve **slab typography and bold brand color** for chrome and moments of action:

- **Character zones:** navbar wordmark (`font-Tabac-Slab`), `Button` labels (`font-Zilla-Slab`), `AuthCard` heroes, primary CTAs
- **Work surfaces:** in-app page titles, table chrome, settings sections, in-panel creation titles — use `Heading` / `Text` with **`branded={false}`** and semantic tokens

### Typography tiers

| Use | Component |
|-----|-----------|
| Navbar wordmark | `font-Tabac-Slab text-brand-primary` |
| Button / CTA labels | `Button` (Zilla Slab via `button.tsx`) |
| Auth / marketing hero | `AuthCard` → `Heading branded level={1}` |
| In-app page title | `Heading as="h1" level={2} branded={false}` |
| Section title | `SectionHeader branded={false}` or `Heading level={3}` |
| In-panel creation title | `PageShell` title (work-surface type) + flat `Section` |
| Standalone branded title | `BrandedCardTitle` outside the workspace shell only |
| Body / metadata | `Text variant="body"` / `"muted"` |

### Layout and spacing

- **Full-bleed dashboards:** workspace shell ([`workspaces+/$id.tsx`](app/routes/workspaces+/$id.tsx)) uses `w-full` with `px-4 sm:px-6` only — no `max-w-[1500px]` on in-workspace routes
- **One padding owner:** workspace content panel OR inner route content, not both (`container mx-auto p-6` inside the panel is wrong)
- **One surface owner:** the workspace panel in [`workspaces+/$id.tsx`](app/routes/workspaces+/$id.tsx) is the card chrome for in-app routes. Inside it, use `Section variant="flat"` + `SectionHeader` (dividers, no nested `bg-card` borders). Reserve elevated `Section`, `ui/card`, and `BrandedCard` for standalone pages (auth) or overlays — not stacked as page containers inside the workspace panel.
- **Visual depth budget:**
  - Depth 1: workspace panel + flat content — preferred
  - Depth 2: one semantic entity card, metric tile, application pane, or choice surface — allowed
  - Depth 3+: blocked unless a documented entity hierarchy requires it and a browser review approves it
  - Input/control borders do not count as surfaces; grouped bordered containers do
- **Progressive disclosure:** collapse secondary detail (credit rates, webhooks, call audio settings) with `Accordion` rather than showing everything at once.
- **Page stack:** `space-y-6` between major sections
- **Section gap:** `gap-4` for flex/grid siblings
- **Card inset:** `p-4 sm:p-6` on workspace panel shell
- **Creation wizards (in-panel):** `PageShell maxWidth="narrow"` — forms stay readable on ultrawide screens

### Visual polish (restrained)

| Layer | Use |
|-------|-----|
| `rounded-md` | inputs, buttons, badges |
| `rounded-lg` | `ui/card`, `Section`, `BrandedCard` |
| `rounded-2xl` | workspace shell panel, `WorkspaceNav` only |
| `shadow-sm` | resting panels and cards |
| `shadow-md` | overlays (Dialog, Sheet, Dropdown, Popover) only |
| Motion | `transition-colors duration-150` on interactive rows; Radix `animate-in` on popovers — no page entrance animations |

### Page structure note

- **`Section` + `SectionHeader`:** in-panel blocks use `variant="flat"`; elevated sections for standalone pages outside the workspace shell
- **`PageShell`:** in-panel titles/actions and narrow creation flows (`maxWidth="narrow"`) — preferred for all in-panel wizards
- **`BrandedCard`:** standalone flows outside the workspace shell (auth, invite) that need branded slab titles + `BrandedCardActions` — not for in-panel creation
- **Chats application panes:** [`chats.route.tsx`](app/routes/workspaces+/$id/chats.route.tsx) is a documented depth-2 application-pane split (list + conversation columns with one border each). Do not wrap those columns in `Card` / `bg-card` inside the workspace panel.

### Call screen panels

- Use shared classes from [`call-panel-classes.ts`](app/components/call/call-panel-classes.ts) for queue, script, household, and call area panels — consistent border, radius, and header bars.

### Quality bar (PR checklist)

1. 375px + 1280px + ≥1920px — no clipped controls; dashboards use full width on ultrawide
2. Light + dark — semantic tokens only on touched surfaces
3. Typography tier — page titles sans-serif; slab on CTAs/chrome only
4. One padding owner per region
5. One surface owner — no card-in-card inside the workspace panel
6. Reuse composition components; no new parallel shells
