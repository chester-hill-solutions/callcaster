/** Shared read-only inventory for local diagnostics and provider sync. */
export async function listLiveWorkspaceNumbers(sql, workspaceId) {
  return sql`
    select phone_number, type, twilio_phone_number_sid, capabilities, created_at
    from workspace_number where workspace = ${workspaceId} and status = 'active'
    order by created_at
  `;
}
