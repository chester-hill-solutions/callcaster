import React from "react";
import { NavLink } from "@remix-run/react";
import { MdCampaign } from "react-icons/md";
import { Badge } from "~/components/ui/badge";

const getStatusColor = (status) => {
  switch (status) {
    case "pending":
      return "bg-yellow-200 text-yellow-800";
    case "scheduled":
      return "bg-blue-200 text-blue-800";
    case "running":
      return "bg-green-200 text-green-800";
    case "complete":
      return "bg-purple-200 text-purple-800";
    case "paused":
      return "bg-orange-200 text-orange-800";
    case "draft":
      return "bg-gray-200 text-gray-800";
    default:
      return "bg-gray-200 text-gray-800";
  }
};

export const CampaignHeader = ({ title, isDesktop = false, status }) => (
  <div className={`mt-2 ${isDesktop ? 'hidden sm:flex' : 'flex sm:hidden'} justify-center gap-2 ${isDesktop ? 'rounded-xl border-2 border-zinc-900 p-2 hover:border-brand-primary' : ''}`}>
    <NavLink
      className={`${isDesktop ? 'flex items-center gap-2' : ''} text-zinc-800 hover:text-brand-primary`}
      to="."
      relative="path"
      end
    >
      {isDesktop && <MdCampaign size={18} />}
      <h3 className="font-Zilla-Slab text-2xl font-semibold">{title}</h3>
      <Badge variant="outline" className={`ml-2 ${getStatusColor(status)}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    </NavLink>
  </div>
);