# CallCaster Design System

Practical reference for building UI in this app. When in doubt: use a semantic token, use a `ui/` primitive, and copy an existing pattern rather than inventing one.

## Tokens

All colors are HSL CSS variables defined in `app/tailwind.css` and mapped in `tailwind.config.js`. **Always use token classes, never raw values** (`bg-white`, `text-gray-500`, hex codes) — tokens are what make dark mode work.

| Token | Use for |
| --- | --- |
| `background` / `foreground` | Page background and default text |
| `card` / `card-foreground` | Card surfaces (slightly elevated in dark mode) |
| `popover` / `popover-foreground` | Dropdowns, popovers, command menus |
| `primary` / `primary-foreground` | Primary actions, links, brand emphasis (brand crimson) |
| `secondary` / `secondary-foreground` | Secondary actions, in-progress states (pale sky blue) |
| `muted` / `muted-foreground` | Subdued surfaces, helper/description text |
| `accent` / `accent-foreground` | Hover/selected states on interactive rows and menu items |
| `destructive` / `destructive-foreground` | Errors, deletion, failed states |
| `success` / `success-foreground` | Completed/healthy states |
| `warning` / `warning-foreground` | Pending/paused/needs-attention states |
| `border`, `input`, `ring` | Borders, form control borders, focus rings |

Brand palette: `brand-primary` (crimson `357 75% 45%`), `brand-secondary` (pale sky blue), `brand-tertiary` (pale pink — used for icon chips at low opacity, e.g. `bg-brand-tertiary/40`).

Radius: driven by `--radius` (0.5rem). Use `rounded-lg` / `rounded-md` / `rounded-sm`, which map to it.

Fonts:
- **Tabac Slab** (`font-Tabac-Slab`) — the wordmark/logo only. Do not use for page content.
- **Zilla Slab** (`font-Zilla-Slab`) — branded headings and marketing surfaces. Apply via `<Heading branded>`, not raw classes.
- **System default** — everything else (body, UI chrome, data).

Dark mode is **class-based** (`darkMode: ["class"]`). It works automatically if you stick to tokens. Never hardcode `bg-white`, `text-black`, or `gray-*` classes; if you must diverge per theme, use `dark:` variants of token classes.

## Primitives (`app/components/ui/`)

Inventory: accordion, alert, badge, button, calendar, card, checkbox, command, datetime, dialog, dropdown-menu, form-field, input, label, page-shell, pagination, popover, progress, select, sheet, skeleton, spinner, status-badge, switch, table, tabs, textarea, tooltip, typography.

- **Heading / Text** (`ui/typography`) — the only heading system. Never write raw `<h1 className="text-3xl...">`. `Heading` takes `level` (1–4, controls size) and `as` (controls the tag — pick the semantically correct one) plus `branded` for Zilla Slab + brand crimson. `Text` variants: `body`, `muted`, `lead`, `small`, `caption`.
- **Card / CardHeader / CardTitle / CardContent** — CardTitle is for card-scale headings; don't nest a level-1/2 Heading inside a card.
- **Badge + StatusBadge** — `Badge` for generic labels; for any entity status string, use `StatusBadge` (`ui/status-badge`) so colors stay consistent app-wide. Extend `statusToVariant` there rather than mapping locally.
- **PageShell** (`ui/page-shell`) vs **WorkspaceResourceListShell** (`components/workspace/`) — list pages that need an empty state and error alert use `WorkspaceResourceListShell`; every other page uses `PageShell` (title, optional description, actions slot, `maxWidth="content" | "narrow" | "full"`). Do not hand-roll `container mx-auto py-8` wrappers.
- **table / DataTable** — use `ui/table` primitives for simple tables; `components/workspace/tables/DataTable` for TanStack-powered tables (sticky headers built in). Cells and headers never wrap (`whitespace-nowrap` is baked into `TableCell`/`TableHead`); the `Table` wrapper scrolls horizontally instead.
- **Dialog / Sheet** — Dialog for confirmations and focused forms; Sheet for side panels.
- **Spinner / Skeleton / Progress** — Spinner for indeterminate inline waits, Skeleton for loading layouts, Progress for known progress.

## Conventions

- **Sentence case** for buttons, labels, menu items, and headings ("Add contact", not "Add Contact").
- **Icon-only buttons require `aria-label`** (and usually a Tooltip).
- **User-facing errors**: never render `error.message` from a caught unknown. Route through `toUserMessage(error, fallback)` (`app/lib/user-message.ts`), then show it in `<Alert variant="destructive">` or a toast. Log the raw detail via `getErrorDetail(error)`.
- **Empty states** get the icon-chip treatment (round `bg-brand-tertiary/40 text-brand-primary` chip + heading + muted description + action), as in `WorkspaceResourceListShell`.
- **Destructive confirmations** use a `Dialog` with a `variant="destructive"` confirm button that names the action ("Delete campaign", not "OK").
- **Statuses** always render via `StatusBadge`; never invent per-page color maps.
- **Table values never wrap.** One row is one line, so rows stay scannable and column alignment holds. Never re-enable wrapping on a cell. For a column that can hold long free text, cap it and clip — `max-w-xs truncate` plus a `title` for the full value — and let the table's own container scroll horizontally when columns don't fit.

## Do / Don't

```tsx
// DO: tokens + primitives
<PageShell title="Webhooks" description="Deliver events to your endpoints" actions={<Button>Add webhook</Button>}>
  <Card>…</Card>
</PageShell>

// DON'T: ad-hoc wrapper + raw heading + raw grays
<div className="container mx-auto py-8">
  <h1 className="text-3xl font-bold text-gray-900">Webhooks</h1>
</div>
```

```tsx
// DO
<StatusBadge status={campaign.status} />
<Text variant="muted">Last synced 5 minutes ago</Text>

// DON'T
<Badge className="bg-green-200 text-green-800">{status}</Badge>
<p className="text-sm text-gray-500">Last synced 5 minutes ago</p>
```

```tsx
// DO
catch (error) {
  logger.error("webhook save failed", { detail: getErrorDetail(error) });
  setError(toUserMessage(error, "Could not save the webhook. Please try again."));
}

// DON'T
catch (error) {
  setError((error as Error).message); // may leak "PGRST301: JWT expired"
}
```

```tsx
// DO: accessible icon button
<Button variant="ghost" size="icon" aria-label="Delete contact"><Trash2 /></Button>

// DON'T
<Button variant="ghost" size="icon"><Trash2 /></Button>
```
