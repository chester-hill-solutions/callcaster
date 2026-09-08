/**
 * Shared shell styling for call-screen panels (queue, script, household, call area).
 *
 * `overflow-hidden` clips inner elements (the coloured header strips in
 * QueueList / Questionnaire / CallArea's StatusBar) to the shell's inner
 * curve, so the strips carry no top radius of their own. Giving them one
 * ("outer 16px − 2px border = 14px inner") looked right in the math but
 * left a sliver of card background at each corner, worst in dark mode,
 * because the strip's antialiased curve never lands on the same pixels
 * as the clip curve (#1344). A square strip fills the corner and the
 * clip alone draws the curve. `shadow-sm` sits outside the element box,
 * so the shadow is unaffected.
 */
export const callPanelShellClass =
  "flex min-h-[300px] flex-col overflow-hidden rounded-2xl border-2 border-brand-secondary/40 bg-card shadow-sm";

export const callPanelHeaderSecondaryClass =
  "flex items-center justify-center bg-brand-secondary px-4 py-3 font-Tabac-Slab text-lg text-foreground";

export const callPanelHeaderPrimaryClass =
  "flex flex-1 items-center justify-center bg-brand-primary px-4 py-3 text-center font-Tabac-Slab text-lg text-primary-foreground";

export const callPanelBodyScrollClass =
  "flex max-h-[80vh] flex-col overflow-y-auto";
