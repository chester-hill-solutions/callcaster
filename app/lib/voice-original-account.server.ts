import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";

export async function createOriginalVoiceAccountClient(owner: { workspace: string; account_sid: string }) {
  const client = await createWorkspaceTwilioInstance({ workspace_id: owner.workspace });
  if (client.accountSid !== owner.account_sid) throw new Error("Voice recovery requires the original provider account");
  return client;
}
