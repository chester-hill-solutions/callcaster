export { middleware } from "./$workspaceId.middleware.server";

import { Outlet } from "react-router";

export default function WorkspaceApiLayout() {
  return <Outlet />;
}
