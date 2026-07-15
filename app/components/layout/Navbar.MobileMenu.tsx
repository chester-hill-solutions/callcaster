import { Link, NavLink } from "react-router";
import { capitalize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { RootNavbarUser } from "@/root.loader.server";

type MobileMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSignedIn: boolean;
  user: RootNavbarUser | null;
  handleSignOut: () => Promise<
    { success: string | null; error: string | null }
  >;
};

export const MobileMenu = ({
  open,
  onOpenChange,
  isSignedIn,
  user,
  handleSignOut,
}: MobileMenuProps) => {
  const navLinkClass =
    "rounded-lg border border-transparent px-3 py-2 font-Zilla-Slab text-lg font-semibold text-foreground transition-colors hover:border-border hover:bg-muted";

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-sm flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b border-border/70 p-4 text-left">
          <SheetTitle className="font-Tabac-Slab text-4xl font-black text-brand-primary">
            <Link to="/" onClick={close}>
              CC
            </Link>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Site navigation menu
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
          <div className="space-y-1">
            <p className="px-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Main
            </p>
            <NavLink to="/" onClick={close} className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/pricing" onClick={close} className={navLinkClass}>
              Pricing
            </NavLink>
            <NavLink to="/docs" onClick={close} className={navLinkClass}>
              Docs
            </NavLink>
            <a
              href="mailto:info@callcaster.ca"
              onClick={close}
              className={`block ${navLinkClass}`}
            >
              Support
            </a>
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
                  to="/account"
                  onClick={close}
                  className={navLinkClass}
                >
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
                  {user.workspace_invite.length} Pending Invitation
                  {user.workspace_invite.length !== 1 ? "s" : ""}
                </NavLink>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  void handleSignOut();
                  close();
                }}
                className="w-full font-Zilla-Slab text-base font-semibold"
              >
                Log Out
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
