export { action } from "./audiodrop.action.server";

type AudiodropDeps = Partial<{
  verifyAuth: (request: Request) => Promise<{ user: { id: string }; headers: Headers }>;
  createWorkspaceTwilioInstance: (args: {
    client: unknown;
    workspace_id: string;
  }) => Promise<unknown>;
}>;

