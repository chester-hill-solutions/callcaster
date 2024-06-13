import { TypedResponse } from "@remix-run/node";
import { Link, NavLink } from "@remix-run/react";
import { AuthError, User } from "@supabase/supabase-js";
import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";
import WorkspaceSelectorCombobox from "./WorkspaceSelectorCombobox";
import { WorkspaceData } from "~/lib/types";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

import { FaUserAlt } from "react-icons/fa";

export default function Navbar({
  className,
  handleSignOut,
  workspaces,
  isSignedIn,
  user,
}: {
  className?: string;
  handleSignOut: () => Promise<
    TypedResponse<{ success: string | null; error: string | null }>
  >;
  workspaces: WorkspaceData;
  isSignedIn: boolean;
  user: JsonifyObject<{
    access_level: string | null;
    created_at: string;
    first_name: string | null;
    id: string;
    last_name: string | null;
    organization: number | null;
    username: string;
  }> | null;
}) {
  const navLinkStyles =
    "rounded-sm border-2 border-zinc-700/30 bg-secondary px-2 py-[6px] font-bold text-brand-primary transition-colors duration-150 ease-in-out hover:bg-white sm:px-4";

  const activeNavLinkStyles =
    "rounded-sm border-2 border-brand-primary bg-white px-2 py-[6px] font-bold text-brand-primary transition-colors duration-150 ease-in-out hover:bg-white sm:px-4";
  return (
    <header className={`w-full ${className}`}>
      <nav
        className="flex w-full items-center gap-1 px-4 py-4 sm:h-[80px] sm:justify-between sm:gap-0 sm:px-8"
        id="global-nav"
      >
        <Link
          to="/"
          className="hidden font-Tabac-Slab text-4xl font-black text-brand-primary sm:block"
        >
          CallCaster
        </Link>
        <Link
          to="/"
          className="block font-Tabac-Slab text-4xl font-black text-brand-primary sm:hidden"
        >
          CC
        </Link>
        {workspaces != null && (
          <WorkspaceSelectorCombobox workspaces={workspaces} />
        )}
        <div className="flex h-full items-center sm:gap-4">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? activeNavLinkStyles : navLinkStyles
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/workspaces"
            className={({ isActive }) =>
              isActive ? activeNavLinkStyles : navLinkStyles
            }
          >
            Workspaces
          </NavLink>
          <NavLink
            to="/other-services"
            className={({ isActive }) =>
              isActive ? activeNavLinkStyles : navLinkStyles
            }
          >
            Services
          </NavLink>
          {isSignedIn ? (
            <Button
              variant="destructive"
              className="rounded-md bg-zinc-400 px-2 py-1 text-center font-Zilla-Slab text-xl font-bold text-white shadow-md transition-colors ease-in-out hover:bg-zinc-600 sm:px-4 sm:text-2xl"
              type="button"
              onClick={() => {
                handleSignOut();
              }}
            >
              Log Out
            </Button>
          ) : (
            <>
              <NavLink
                to="/signin"
                className={({ isActive }) =>
                  isActive
                    ? "rounded-md border-2 border-brand-primary bg-white px-2 py-1 text-center font-Zilla-Slab text-xl font-bold text-brand-primary shadow-md transition-colors ease-in-out hover:bg-white hover:text-brand-primary sm:px-4 sm:text-2xl"
                    : "rounded-md bg-brand-primary px-2 py-1 text-center font-Zilla-Slab text-xl font-bold text-white shadow-md transition-colors ease-in-out hover:bg-white hover:text-brand-primary sm:px-4 sm:text-2xl"
                }
              >
                <p className="block sm:hidden">Login</p>
                <p className="hidden sm:block">Sign In</p>
              </NavLink>
              <NavLink
                to="/signup"
                className={({ isActive }) =>
                  isActive
                    ? "rounded-md border-2 border-zinc-600 bg-white px-2 py-1 text-center font-Zilla-Slab text-xl font-bold text-zinc-600 shadow-md transition-colors ease-in-out sm:px-4 sm:text-2xl"
                    : "rounded-md bg-zinc-400 px-2 py-1 text-center font-Zilla-Slab text-xl font-bold text-white shadow-md transition-colors ease-in-out hover:bg-zinc-600 sm:px-4 sm:text-2xl"
                }
              >
                <p className="">Sign Up</p>
              </NavLink>
            </>
          )}
          {user != null && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button>
                  <FaUserAlt />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>My Username:</DropdownMenuLabel>
                <DropdownMenuLabel>{user.username}</DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <ModeToggle />
        </div>
      </nav>
    </header>
  );
}
