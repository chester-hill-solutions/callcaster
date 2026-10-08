import { Link, NavLink } from "react-router";
import { capitalize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  RootNavbarUser,
  RootWorkspaceSummary,
} from "@/root.loader.server";

type MobileMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSignedIn: boolean;
  user: RootNavbarUser | null;
  handleSignOut: () => Promise<
    { success: string | null; error: string | null }
  >;
  workspaces: RootWorkspaceSummary[] | null;
  activeWorkspaceId: string | undefined;
};

export const MobileMenu = ({
  open,
  onOpenChange,
  isSignedIn,
  user,
  handleSignOut,
  workspaces,
  activeWorkspaceId,
}: MobileMenuProps) => {
  const navLinkClass =
    "block rounded-lg border border-transparent px-3 py-2 font-Zilla-Slab text-lg font-semibold text-foreground transition-colors hover:border-border hover:bg-muted";

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-sm flex-col gap-0 p-0"
      >
        <SheetHeader className="border-border/70 border-b p-4 text-left">
          <SheetTitle className="font-Tabac-Slab text-brand-primary text-4xl font-black">
            <Link to="/" onClick={close}>
              CC
            </Link>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Site navigation menu
          </SheetDescription>
        </SheetHeader>

        <SheetBody
          inset="navigation"
          className="flex flex-1 flex-col gap-6 overflow-y-auto"
        >
          <div className="space-y-1">
            <p className="text-muted-foreground px-2 text-xs uppercase tracking-[0.16em]">
              Main
            </p>
            <NavLink to="/" onClick={close} className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/docs" onClick={close} className={navLinkClass}>
              Docs
            </NavLink>
            {!isSignedIn && (
              <>
                <NavLink to="/signin" onClick={close} className={navLinkClass}>
                  Sign In
                </NavLink>
                <NavLink to="/signup" onClick={close} className={navLinkClass}>
                  Sign Up
                </NavLink>
              </>
            )}
          </div>

          {user && workspaces && workspaces.length > 0 && (
            <div className="space-y-1">
              <p className="text-muted-foreground px-2 text-xs uppercase tracking-[0.16em]">
                Your workspaces
              </p>
              {workspaces.map((workspace) => (
                <NavLink
                  key={workspace.id}
                  to={`/workspaces/${workspace.id}`}
                  onClick={close}
                  className={`${navLinkClass} truncate ${
                    workspace.id === activeWorkspaceId
                      ? "border-border bg-muted"
                      : ""
                  }`}
                >
                  {workspace.name}
                </NavLink>
              ))}
            </div>
          )}

          {user && (
            <div className="border-border/80 bg-card/70 space-y-3 rounded-xl border p-3">
              <div>
                <p className="font-Zilla-Slab text-lg font-semibold">
                  {capitalize(user.first_name ?? "")}
                </p>
                <p className="text-muted-foreground text-sm">{user.username}</p>
              </div>
              <div className="space-y-1">
                <NavLink to="/account" onClick={close} className={navLinkClass}>
                  Account
                </NavLink>
                <NavLink
                  to="/workspaces"
                  onClick={close}
                  className={navLinkClass}
                >
                  Workspaces
                </NavLink>
                <NavLink
                  to="/accept-invite"
                  onClick={close}
                  className={navLinkClass}
                >
                  {`${user.workspace_invite.length} Pending Invitation${user.workspace_invite.length === 1 ? "" : "s"}`}
                </NavLink>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  void handleSignOut();
                  close();
                }}
                className="font-Zilla-Slab w-full text-base font-semibold"
              >
                Log Out
              </Button>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};
