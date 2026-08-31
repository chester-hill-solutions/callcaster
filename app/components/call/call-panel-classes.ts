/**
 * Shared shell styling for call-screen panels (queue, script, household, call area).
 *
 * `overflow-hidden` clips inner elements (the coloured header strips in
 * QueueList / Questionnaire / CallArea's StatusBar) to the shell's inner
 * curve. Without it, matching those strips' top-corner radius manually
 * ("outer 16px − 2px border = 14px inner") looked correct in the math
 * but drifted visibly on retina/dark mode because subpixel rounding
 * doesn't split evenly between the border and the child radius — the
 * reported outline-vs-element mismatch in #1344. `shadow-sm` sits
 * outside the element box, so the shadow is unaffected.
 */
export const callPanelShellClass =
  "flex min-h-[300px] flex-col overflow-hidden rounded-2xl border-2 border-brand-secondary/40 bg-card shadow-sm";

export const callPanelHeaderSecondaryClass =
  "flex items-center justify-center rounded-t-[14px] bg-brand-secondary px-4 py-3 font-Tabac-Slab text-lg text-foreground";

export const callPanelHeaderPrimaryClass =
  "flex flex-1 items-center justify-center rounded-t-[14px] bg-brand-primary px-4 py-3 text-center font-Tabac-Slab text-lg text-primary-foreground";

export const callPanelBodyScrollClass =
  "flex max-h-[80vh] flex-col overflow-y-auto";
