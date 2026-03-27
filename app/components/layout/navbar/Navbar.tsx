import { useRef, useState } from "react";
import { TypedResponse } from "@remix-run/node";
import { Link, Params, useLocation } from "@remix-run/react";
import { FaBars } from "react-icons/fa";
import { ModeToggle } from "@/components/shared/mode-toggle";
import { User, WorkspaceData, WorkspaceInvite } from "@/lib/types";
import { NavbarMobileMenu } from "./NavbarMobileMenu";
import { NavButton } from "./NavButton";
import { UserDropdownMenu } from "./UserDropdownMenu";

type NavbarProps = {
  className?: string;
  handleSignOut: () => Promise<
    TypedResponse<{ success: string | null; error: string | null }>
  >;
  workspaces: WorkspaceData[] | null;
  isSignedIn: boolean;
  user: (User & { workspace_invite: WorkspaceInvite[] }) | null;
  params: Params<string>;
};

export default function Navbar({
  className,
  handleSignOut,
  workspaces,
  isSignedIn,
  user,
  params,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const workspaceId = params.id;
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  if (location.pathname !== pathnameRef.current) {
    pathnameRef.current = location.pathname;
    if (mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }
  return location.pathname.endsWith("call") ||
    (location.pathname.includes("survey") &&
      !location.pathname.includes("workspaces")) ? (
    <div></div>
  ) : (
    <header className={`w-full border-b border-border/70 ${className}`}>
      <nav className="relative mx-auto flex w-full max-w-[1500px] items-center justify-between px-4 py-3 sm:h-[80px] sm:px-6">
        <Link
          to="/"
          className="hidden font-Tabac-Slab text-4xl font-black text-brand-primary sm:block"
        >
          CallCaster
        </Link>
        <Link
          to="/"
          className="font-Tabac-Slab text-4xl font-black text-brand-primary sm:hidden"
        >
          CC
        </Link>
        <div className="hidden items-center space-x-3 sm:flex">
          <NavButton to="/pricing">Pricing</NavButton>
          {/* <NavButton to="/">Home</NavButton> */}
          {/*           <NavButton to="/services">Services</NavButton>
           */}{" "}
          {!isSignedIn && (
            <>
              <NavButton to="/signin">Sign In</NavButton>
              <NavButton to="/signup">Sign Up</NavButton>
            </>
          )}
          {workspaces && <NavButton to={"/workspaces"}>Workspaces</NavButton>}
          {user && (
            <UserDropdownMenu
              user={user}
              handleSignOut={handleSignOut}
              workspaceId={workspaceId}
            />
          )}
          <ModeToggle />
        </div>
        <button
          className="rounded-md border border-border bg-background/80 p-2 text-2xl sm:hidden"
          onClick={() => setMobileMenuOpen(true)}
        >
          <FaBars />
        </button>
      </nav>
      {mobileMenuOpen && (
        <NavbarMobileMenu
          isSignedIn={isSignedIn}
          user={user ?? null}
          handleSignOut={handleSignOut}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
    </header>
  );
}
