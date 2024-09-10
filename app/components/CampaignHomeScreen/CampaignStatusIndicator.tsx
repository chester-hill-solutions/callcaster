import React, { ReactNode } from "react";
import type { CampaignStatus } from "~/lib/types";
import { FaCircleCheck, FaCirclePause, FaCirclePlay } from "react-icons/fa6";

export default function CampaignStatusIndicator({
  campaignStatus,
}: {
  campaignStatus: CampaignStatus;
}) {
  let statusClassName: string = "";
  let statusIcon: ReactNode = <></>;
  switch (campaignStatus) {
    case "complete":
      statusClassName = "";
      statusIcon = <FaCircleCheck size={"16px"} color="#4ade80" />;
      break;
    case "running":
      statusClassName = "animate-pulse";
      statusIcon = <FaCirclePlay size={"16px"} color="#f87171" />;
      break;
    case "paused":
      statusClassName = "";
      statusIcon = <FaCirclePause />;
      break;
    default:
      statusClassName = "";
  }

  return <div className={statusClassName}>{statusIcon}</div>;
}
