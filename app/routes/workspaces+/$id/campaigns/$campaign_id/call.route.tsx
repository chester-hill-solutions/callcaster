export { loader } from "./call.loader.server";
export { action } from "./call.action.server";

import { CallScreenLayout } from "@/components/call/CallScreen.Layout";
import { useCallScreen } from "@/hooks/call/useCallScreen";
import { useLoaderData } from "react-router";
import type { LoaderData } from "@/lib/types";

export default function CallScreen() {
  const { workspaceId, user, campaign } = useLoaderData<LoaderData>();
  return <CallScreenSession key={`${workspaceId}:${user.id}:${campaign?.id}`} />;
}

function CallScreenSession() {
  const layoutProps = useCallScreen();
  return <CallScreenLayout {...layoutProps} />;
}
