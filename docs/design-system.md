# Design System Usage

This project uses a single canonical design system. Follow these conventions so UI stays consistent and maintainable.

## Primitives

- **Use [app/components/ui/](app/components/ui/) as the only primitive layer.** Prefer `Input`, `Select`, `Textarea`, `Label`, `Checkbox`, `Switch`, `Button`, `Card`, `Table`, `Badge`, `Alert`, `Dialog`, `Sheet`, `Tabs`, `Pagination`, etc. from `ui/`.
- **Typography:** Use `Heading` and `Text` from [app/components/ui/typography/](app/components/ui/typography/) for titles and body copy. Use the `branded` variant where the app’s Zilla Slab look is desired.
- **Loading:** Use `Skeleton` from [app/components/ui/skeleton.tsx](app/components/ui/skeleton.tsx) for table rows, cards, and form placeholders while data loads.

## Form layout

- **Use `FormField`** from [app/components/ui/form-field/](app/components/ui/form-field/) for every form field. It provides label, optional description, optional error message, and consistent spacing. Put the control (Input, Select, Textarea, Switch, etc.) as the child of `FormField`.

## Page structure

- **Auth flows:** Use `AuthCard` from [app/components/shared/AuthCard.tsx](app/components/shared/AuthCard.tsx) for signin, signup, password reset, and invite acceptance. It provides a centered card with branded title and description slot.
- **Settings and creation:** Use `Section` and `SectionHeader` from [app/components/shared/section/](app/components/shared/section/) for settings blocks and creation flows. Use `SectionHeader` for title + optional description + actions.
- **Branded cards:** For creation wizards and settings blocks that need the Zilla Slab title and actions layout, use `BrandedCard`, `BrandedCardTitle`, `BrandedCardContent`, `BrandedCardActions` from [app/components/shared/branded-card/](app/components/shared/branded-card/) (or the re-exports via `CustomCard` for backward compatibility).

## Tables and pagination

- **Tables:** Use [app/components/workspace/tables/DataTable.tsx](app/components/workspace/tables/DataTable.tsx) with TanStack Table for data grids. It supports optional toolbar, loading skeleton rows, custom empty state, and optional pagination.
- **Pagination:** Use [app/components/shared/TablePagination.tsx](app/components/shared/TablePagination.tsx) as the single pagination composition. Queue and other list screens use it (e.g. via `QueueTablePagination`).

## Toasts

- **One Toaster:** The app mounts a single `<Toaster />` (sonner) in [app/root.tsx](app/root.tsx). Do not mount `<Toaster />` in routes.
- **Usage:** `import { toast } from "sonner"` and call `toast.success()`, `toast.error()`, etc. as needed.

## Deprecated / legacy

- **CustomCard:** Prefer `ui/card` or the branded components from `BrandedCard`. `CustomCard` is a thin re-export of `BrandedCard` for backward compatibility; new code should use `BrandedCard` or plain `ui/card` where appropriate.
- **forms/Inputs:** The legacy `TextInput`, `Dropdown`, `DateTime`, `Toggle` from [app/components/forms/Inputs.tsx](app/components/forms/Inputs.tsx) are deprecated. Use `ui/input`, `ui/select`, `ui/datetime`, `ui/switch` with `FormField` instead. Feature-specific components in `forms/` (e.g. `AudioSelector`) remain.

## Tokens

- Prefer semantic tokens: `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, etc. Use `Heading`/`Text` and shared components so brand colors and type scales live in one place rather than in ad hoc route classes.
