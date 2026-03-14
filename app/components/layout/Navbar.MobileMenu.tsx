import { capitalize } from "@/lib/utils";

import { Link, NavLink } from "@remix-run/react";
import { FaTimes } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { User, WorkspaceInvite } from "@/lib/types";
import { TypedResponse } from "@remix-run/node";

type MobileMenuProps = {
  isSignedIn: boolean;
  user: (User & { workspace_invite: WorkspaceInvite[] }) | null;
  handleSignOut: () => Promise<
    TypedResponse<{ success: string | null; error: string | null }>
  >;
  onClose: () => void;
};

export const MobileMenu = ({
  isSignedIn,
  user,
  handleSignOut,
  onClose,
}: MobileMenuProps) => {
  const navLinkClass =
    "rounded-lg border border-transparent px-3 py-2 font-Zilla-Slab text-lg font-semibold text-foreground transition-colors hover:border-border hover:bg-muted";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/70 p-4">
        <Link
          to="/"
          className="font-Tabac-Slab text-4xl font-black text-brand-primary"
        >
          CC
        </Link>
        <button
          onClick={onClose}
          className="rounded-md border border-border p-2 text-2xl"
        >
          <FaTimes />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
        <div className="space-y-1">
          <p className="px-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Main
          </p>
          <NavLink to="/" onClick={onClose} className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/pricing" onClick={onClose} className={navLinkClass}>
            Pricing
          </NavLink>
          {!isSignedIn && (
            <>
              <NavLink to="/signin" onClick={onClose} className={navLinkClass}>
                Sign In
              </NavLink>
              <NavLink to="/signup" onClick={onClose} className={navLinkClass}>
                Sign Up
              </NavLink>
            </>
          )}
        </div>

        {user && (
          <div className="space-y-3 rounded-xl border border-border/80 bg-card/70 p-3">
            <div>
              <p className="font-Zilla-Slab text-lg font-semibold">
                {capitalize(user.first_name ?? "")}
              </p>
              <p className="text-sm text-muted-foreground">{user.username}</p>
            </div>
            <div className="space-y-1">
              <NavLink
                to="/workspaces"
                onClick={onClose}
                className={navLinkClass}
              >
                Workspaces
              </NavLink>
              <NavLink
                to="/accept-invite"
                onClick={onClose}
                className={navLinkClass}
              >
                {user.workspace_invite.length} Pending Invitation
                {user.workspace_invite.length !== 1 ? "s" : ""}
              </NavLink>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                handleSignOut();
                onClose();
              }}
              className="w-full font-Zilla-Slab text-base font-semibold"
            >
              Log Out
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
