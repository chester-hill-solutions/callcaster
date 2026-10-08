export type IvrPageLayout = {
  pages: Record<string, unknown>;
  startPageId?: string;
  pageOrder?: string[];
};

export function orderedIvrPageIds(script: IvrPageLayout): string[] {
  const existing = Object.keys(script.pages);
  const stored = Array.isArray(script.pageOrder) ? script.pageOrder : [];
  return [...new Set([
    ...stored.filter((id) => typeof id === "string" && Object.hasOwn(script.pages, id)),
    ...existing,
  ])];
}

export function resolveIvrEntryPageId(script: IvrPageLayout): string | undefined {
  if (script.startPageId !== undefined) {
    return typeof script.startPageId === "string" && Object.hasOwn(script.pages, script.startPageId)
      ? script.startPageId : undefined;
  }
  return orderedIvrPageIds(script)[0];
}
