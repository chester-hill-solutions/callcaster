import { NavLink } from "@remix-run/react";
import {handleNavlinkStyles} from "~/lib/utils";

export const NavigationLinks = ({ hasAccess, data }) => (
    <div className="flex gap-2">
      <NavLink
        className={({ isActive, isPending }) =>
          handleNavlinkStyles(isActive, isPending)
        }
        to="script"
        relative="path"
      >
        Script
      </NavLink>
  
      {hasAccess && (
        <NavLink
          className={({ isActive, isPending }) =>
            handleNavlinkStyles(isActive, isPending)
          }
          to="settings"
          relative="path"
        >
          Settings
        </NavLink>
      )}
      {data.type === "live_call" && data.status === "running" && (
        <NavLink
          className={({ isActive, isPending }) =>
            handleNavlinkStyles(isActive, isPending)
          }
          to={`call`}
          relative="path"
        >
          Join Campaign
        </NavLink>
      )}
    </div>
  );
  