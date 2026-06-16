import { Outlet, useOutletContext } from "react-router";
import type { ContextType } from "@/lib/types";

export default function WorkspacesLayout() {
  const context = useOutletContext<ContextType>();
  return <Outlet context={context} />;
}
