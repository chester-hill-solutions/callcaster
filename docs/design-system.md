# Design System Usage

This project uses the Callcaster-branded **`@chester-hill-solutions/shad-cc`** design system (React Aria Components + Tailwind v4), with thin Radix-compat adapters under [`app/components/ui/`](app/components/ui/).

For a full inventory of components, static assets, icons, route surfaces, and known redundancies, see [design-system-audit.md](design-system-audit.md).

## Package source

The canonical shared component source is [the CHS ui-kit workbench](https://github.com/chester-hill-solutions/chester-hill-solutions/tree/main/apps/ui-kit-docs/packages/ui/src). Its components, catalog and tests are edited there, then synced into `packages/ui-kit/templates`. The [source contract](https://github.com/chester-hill-solutions/chester-hill-solutions/blob/main/packages/ui-kit/SOURCE.md) explicitly excludes external brand forks as package sources.

CallCaster currently consumes the vendored `@chester-hill-solutions/shad-cc` compatibility package in [vendor/chester-hill-solutions/shad-cc](../vendor/chester-hill-solutions/shad-cc). It retains the app's theme and adapter API. Generic feedback changes start in the canonical workbench, then enter this compatibility layer through a reviewed source snapshot with provenance. Do not edit an external fork or generated bundle as the source of a new contract. Rebuild and verify any generated vendor output that changes.

The app still imports `@chester-hill-solutions/shad-cc/theme.css` from [app/tailwind.css](../app/tailwind.css). Keep that theme, component geometry and existing page layout during targeted adoption. A wholesale library or palette migration is separate work.

## Primitives

- **Import from [`app/components/ui/`](app/components/ui/).** Most files re-export or adapt `@chester-hill-solutions/shad-cc/*`. Prefer `Input`, `Select`, `Textarea`, `Label`, `Checkbox`, `Switch`, `Button`, `Card`, `Table`, `Badge`, `Alert`, `Dialog`, `Sheet`, `Tabs`, `Pagination`, etc.
- **Compatibility:** Call sites may keep Radix-shaped props (`disabled`, `checked`, `value`/`onValueChange`, `asChild`). Adapters map these onto React Aria (`isDisabled`, `isSelected`, `selectedKey`, etc.).
- **Typography:** Use `Heading` and `Text` from [app/components/ui/typography.tsx](app/components/ui/typography.tsx) for titles and body copy. Use the `branded` variant where the app’s Zilla Slab look is desired. Legacy classes `font-Zilla-Slab` / `font-Tabac-Slab` still resolve via `@theme` aliases to `font-heading` / `font-brand`.
- **Loading:** Use `Skeleton` from [app/components/ui/skeleton.tsx](app/components/ui/skeleton.tsx) for table rows, cards, and form placeholders while data loads.

## Form layout

- **Use `FormField`** from [app/components/ui/form-field.tsx](app/components/ui/form-field.tsx) for every form field. It provides label, optional description, optional error message, and consistent spacing. Put the control (Input, Select, Textarea, Switch, etc.) as the child of `FormField`.

### Field accessibility contract

For a direct control, set `FormField.htmlFor` and the control's `id` to the same value. `FormField` connects its help and error text to that control and sets `aria-invalid` while a field error is present.

```tsx
<FormField
  htmlFor="organization-email"
  label="Organization email"
  description="Use an address your team can access."
  error={errors.email}
>
  <Input id="organization-email" name="email" type="email" required />
</FormField>
```

For a nested control, or a compound component such as `Select`, wrap the focusable control with `FormFieldControl`. Keep the wrapper inside the compound component, around its trigger:

```tsx
<FormField htmlFor="country" label="Country" error={errors.country}>
  <Select name="country">
    <FormFieldControl>
      <SelectTrigger id="country">
        <SelectValue placeholder="Choose a country" />
      </SelectTrigger>
    </FormFieldControl>
    <SelectContent>{countryOptions}</SelectContent>
  </Select>
</FormField>
```

- Existing `aria-describedby` IDs are retained and merged with the field's IDs. A field error takes precedence over `aria-invalid={false}` on the control. When the error is removed, the control's own invalid state is retained.
- Custom control components must forward ARIA attributes to their focusable input or trigger. The field does not search through arbitrary component trees or assign feedback to adjacent actions.
- `required` on `FormField` displays the label marker. Set `required` on a native input or use the control's validation API to enforce a required value.
- Keep plain-control CSS fallbacks in `@layer base`. Unlayered rules override Tailwind utilities, even with a zero-specificity `:where()` selector, and can hide invalid borders or replace component spacing.
- Use the shared field contract for new forms. Do not rebuild the description and error association in each route. The app adapter owns this behavior; shad-cc owns the underlying control visuals and tokens.

## Page structure

- **Auth flows:** Use `AuthCard` from [app/components/shared/AuthCard.tsx](app/components/shared/AuthCard.tsx) for signin, signup, password reset, and invite acceptance. It provides a centered card with branded title and description slot.
- **Settings and creation:** Use `Section` and `SectionHeader` from [app/components/shared/Section.tsx](app/components/shared/Section.tsx) for settings blocks and creation flows. Use `SectionHeader` for title + optional description + actions. Inside the workspace panel, pass `variant="flat"` explicitly.
- **In-panel creation:** Use `PageShell` (`maxWidth="narrow"`) + flat `Section`s for campaign/audience/script/audio creation nested under `/workspaces/:id`. Reserve `BrandedCard` for standalone flows outside the workspace panel (auth, invite, marketing).
- **List empty states:** Use `WorkspaceResourceListShell` / `WorkspaceResourceEmptyState` — flat heading, description, illustration, and action with no Card chrome.
- **Branded cards:** For standalone wizards that need the Zilla Slab title and actions layout outside the workspace panel, use `BrandedCard`, `BrandedCardTitle`, `BrandedCardContent`, `BrandedCardActions` from [app/components/shared/BrandedCard.tsx](app/components/shared/BrandedCard.tsx) (or the re-exports via `CustomCard` for backward compatibility).

## Tables and pagination

- **Tables:** Use [app/components/workspace/tables/DataTable.tsx](app/components/workspace/tables/DataTable.tsx) with TanStack Table for data grids. It supports optional toolbar, loading skeleton rows, custom empty state, and optional pagination.
- **Pagination:** Use [app/components/shared/TablePagination.tsx](app/components/shared/TablePagination.tsx) as the single pagination composition. It renders the range summary and page controls, plus an optional page-size select (`pageSizeOptions` + `onPageSizeChange`) that the admin panels use. Queue and other list screens use it (e.g. via `QueueTablePagination`).

## Feedback surfaces

**A message must not move page content when it appears, updates or disappears.** Dynamic alerts render outside document flow, or inside an area that was already reserved. Do not insert a conditional banner above the page, its form or its actions. Retain existing page sections, spacing, widths and action positions.

| Meaning | Shared surface | Lifetime and behavior |
| --- | --- | --- |
| A value in a specific field is invalid | `FormField` field feedback | Keep the accessible field association. Use an anchored message or an existing reserved area so the control stays put; do not convert validation into an unassociated toast. |
| A brief action succeeded or failed | Single root Sonner Toaster | Deliver once for that action; preserve failed form values and retry. Do not repeat the same failure in a local row. |
| A condition remains unresolved | Shared overlay notice | Keep it readable until resolved or explicitly dismissed. Retain required remedies and hard guards. Do not hide a required action behind transient feedback. |
| An action needs deliberate consent | Shared controlled Dialog/AlertDialog | State the effect, offer Cancel, lock actions while pending, and dispatch only after consent. It is an overlay and does not move page landmarks. |
| The page/region is unavailable | Shared route/region failure composition | Replace the unavailable region with useful recovery content. This is failure-page content, not a newly inserted notification beside usable content. |
| An error/status belongs to a stored record | Existing record/table/status content | Keep it with the record. It is distinct from the result of a new action. |

- **Shared ownership:** the component library owns placement, stacking, spacing, tone, dismissal controls and accessible behavior. CallCaster owns domain copy, permissions, recovery actions and route/cookie lifetime. Keep adapters thin; do not copy library class strings into routes.
- **Tone:** use neutral, info, success, warning or error explicitly. ARIA `alert`/`status` controls announcements; it does not establish severity. Neutral content must not look like a failure. Do not express warning only through a local color override.
- **One Toaster:** [app/root.tsx](../app/root.tsx) mounts the root Sonner host at `top-right`. Routes call `toast.success()`, `toast.error()`, etc. from `sonner`; they do not mount another host.
- **Persistent notices:** their shared host must remain outside document flow, handle multiple notices and long content, and keep required actions usable. Do not replace important warnings with expiring toasts to achieve layout stability.
- **Confirmation:** all entry points for one action use one controlled confirmation and one action implementation. Cancel/Escape do nothing; a pending confirmation cannot send twice. Native browser beforeunload prompts remain browser-owned.
- **History and replay:** a presentation-only URL clear uses replacement, with unrelated parameters retained. One-time server events use validated server-owned flash state, not shareable success URLs.
- **Proof:** test page landmark rectangles and scroll position before appearance, after appearance, after update and after dismissal in a real browser. Include narrow/desktop, light/dark, keyboard, long messages, multiple notices, failure retry and pending actions. DOM/class tests alone do not prove no layout movement.

The [feedback inventory](feedback-inventory.md) lists all reviewed inline error candidates, Alert tones, duplicate groups and keep/change reasons at the stated source snapshot. Existing defects remain visible until atomic fixes land; this rule is not a claim that all current sites comply. #2058 owns the rule/inventory; #2300 owns the broader rollout.

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
- The call screen uses the three-column [`CallWorkbench`](app/components/call/CallScreen.Workbench.tsx) layout: queue rail (left, lg+ only — the header queue sheet covers mobile), script/questionnaire (center), and a sticky action column (right: call panel with state-driven primary action + disposition, then the household-member switcher). On mobile it collapses to a single column in task order: call panel → household → script.

### Quality bar (PR checklist)

1. 375px + 1280px + ≥1920px — no clipped controls; dashboards use full width on ultrawide
2. Light + dark — semantic tokens only on touched surfaces
3. Typography tier — page titles sans-serif; slab on CTAs/chrome only
4. One padding owner per region
5. One surface owner — no card-in-card inside the workspace panel
6. Reuse composition components; no new parallel shells
