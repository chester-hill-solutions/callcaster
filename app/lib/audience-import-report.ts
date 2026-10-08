export function audienceImportReportUrl(workspaceId: string, uploadId: number): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/audience-imports/${uploadId}/report`;
}
