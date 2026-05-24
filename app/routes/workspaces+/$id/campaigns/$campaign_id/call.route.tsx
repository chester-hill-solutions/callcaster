export { loader } from "./call.loader.server";
export { action } from "./call.action.server";

import { CallScreenLayout } from "@/components/call/CallScreen.Layout";
import { useCallScreen } from "@/hooks/call/useCallScreen";

export default function CallScreen() {
  const layoutProps = useCallScreen();
  return <CallScreenLayout {...layoutProps} />;
}
