# CSV export contract

This project has multiple places that generate CSV (reports, exports, downloads). To ensure **parity** across UI and exports and avoid CSV corruption/security issues, all CSV generation should follow the rules below.

## Encoding + transport

- **Encoding**: UTF-8.
- **BOM**: Include a UTF-8 BOM (`U+FEFF`) at the beginning of the file for maximum Excel compatibility.
- **Content-Type**: `text/csv; charset=utf-8`.
- **Line endings**: Use CRLF (`\r\n`) so Excel and other tools parse rows consistently.

## Headers

- **Deterministic**: Headers must be stable and ordered deterministically.
- **No implicit coercion**: Header selection must not depend on truthy/falsy checks that can drop columns unexpectedly.

## Cell formatting (RFC4180-style)

- **Null-ish values**: `null` / `undefined` become an empty cell.
- **Booleans and numbers**: Preserve `0` and `false` (do not treat them as empty).
- **Quoting**: Quote a cell if it contains any of:
  - comma (`,`)
  - double quote (`"`)
  - carriage return (`\r`) or newline (`\n`)
- **Escaping quotes**: Inside quoted cells, double quotes must be doubled (`"` becomes `""`).

## CSV injection protection (spreadsheet formula injection)

To prevent spreadsheets from treating untrusted values as formulas, any cell whose **first non-whitespace character** is one of:

- `=`, `+`, `-`, `@`

must be **prefixed with a single quote** (`'`) before applying CSV quoting/escaping.

Notes:
- This protection should be applied to **user-controlled** or **external** fields (names, addresses, free-form answers, etc.).
- Values that are intentionally formulas should not be emitted by exports in this product.

## Dates + timezones

- CSV exports must use **deterministic** formats. Prefer **ISO 8601** timestamps in UTC (e.g. `2026-02-25T19:31:12.123Z`) unless a specific export explicitly requires a workspace-local date presentation.
- Avoid server-side `toLocaleString()` / `toLocaleDateString()` in exports because it varies by runtime locale/timezone.

## Implementation rule

All new/updated CSV outputs must use the shared CSV utilities in `app/lib/csv.ts` (or a future replacement) rather than ad-hoc string building.

