import React from "react";
import { NavLink } from "@remix-run/react";
import { MdCampaign } from "react-icons/md";

export const CampaignHeader = ({ title, isDesktop = false }) => (
  <div className={`mt-2 ${isDesktop ? 'hidden sm:flex' : 'flex sm:hidden'} justify-center gap-2 ${isDesktop ? 'rounded-xl border-2 border-zinc-900 p-2 hover:border-brand-primary' : ''}`}>
    <NavLink
      className={`${isDesktop ? 'flex items-center gap-2' : ''} text-zinc-800 hover:text-brand-primary`}
      to="."
      relative="path"
      end
    >
      {isDesktop && <MdCampaign size={18} />}
      <h3 className="font-Zilla-Slab text-2xl font-semibold">{title}</h3>
    </NavLink>
  </div>
);
