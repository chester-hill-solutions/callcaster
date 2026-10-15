import type { MetaFunction } from "react-router";
import { MessageSegmentCalculator } from "@/components/message-segment-calculator";

export const meta: MetaFunction = () => [
  { title: "Message Segment Calculator — CallCaster" },
  {
    name: "description",
    content: "Estimate SMS segments, encoding, and credits for a message.",
  },
];

export default function MessageSegmentCalculatorRoute() {
  return <MessageSegmentCalculator />;
}
