/** Desktop workspace column height (viewport minus header/padding). */
export const workspacePanelHeightClass =
  "h-[calc(100vh-112px)] min-h-[560px]";

/** Same height as {@link workspacePanelHeightClass}, scoped to large breakpoints. */
export const workspacePanelHeightLgClass =
  "lg:h-[calc(100vh-112px)] lg:min-h-[560px]";

/**
 * Sidebar variant: same height but no 560px floor — a sticky panel taller
 * than a short viewport pins at the top and its bottom (Billing/Credits)
 * becomes unreachable (#1059). The nav body scrolls internally instead.
 */
export const workspaceSidebarHeightClass = "h-[calc(100vh-112px)]";
