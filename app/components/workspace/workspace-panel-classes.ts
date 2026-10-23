/** Desktop workspace column height (viewport minus header/padding). */
export const workspacePanelHeightClass =
  "h-[calc(100vh-112px)] min-h-[560px]";

/** Strict desktop viewport height for panels that scroll their own content. */
export const workspaceViewportHeightLgClass = "lg:h-[calc(100vh-112px)]";

/** Let the workspace content panel fill the available shell height and scroll internally. */
export const workspacePanelHeightLgClass = "lg:min-h-0";

/**
 * Sidebar variant: same height but no 560px floor — a sticky panel taller
 * than a short viewport pins at the top and its bottom (Billing/Credits)
 * becomes unreachable (#1059). The nav body scrolls internally instead.
 */
export const workspaceSidebarHeightClass = "h-full min-h-0";
