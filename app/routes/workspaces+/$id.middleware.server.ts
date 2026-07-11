import { workspaceMiddleware } from "@/lib/workspace-middleware.server";

// React Router 8 requires the route `middleware` export to be an array.
export const middleware = [workspaceMiddleware];
