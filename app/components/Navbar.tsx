import { useEffect, useState } from "react";
import { TypedResponse } from "@remix-run/node";
import {
  Link,
  NavLink,
  Params,
  useLocation,
  useNavigation,
} from "@remix-run/react";
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
import { FaBars, FaUserAlt } from "react-icons/fa";
import { MdOutlineLogout } from "react-icons/md";
import { capitalize } from "~/lib/utils";
import { MobileMenu } from "./Navbar.MobileMenu";

type NavbarProps = {
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
  params: Params<string>;
};

export const NavButton = ({ to, children, className = "" }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `rounded-md px-3 py-2 font-Zilla-Slab text-lg font-bold transition-colors duration-150 ease-in-out ${
        isActive
          ? "bg-brand-primary text-white"
          : "bg-secondary text-brand-primary hover:bg-white"
      } ${className}`
    }
  >
    {children}
  </NavLink>
);

const UserDropdownMenu = ({ user, handleSignOut, workspaceId }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="outline"
        className="border-2 border-zinc-700/30 transition-colors duration-150 hover:border-black hover:bg-inherit dark:bg-inherit dark:text-black"
      >
        <FaUserAlt size="20px" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-56">
      <DropdownMenuLabel>Profile Info:</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="font-normal">
        {capitalize(user.first_name)}
      </DropdownMenuLabel>
      <DropdownMenuLabel className="font-normal">
        {user.username}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Button
          id="logoutButton"
          variant="ghost"
          className="w-full justify-start font-Zilla-Slab"
          onClick={handleSignOut}
        >
          <MdOutlineLogout className="mr-2 h-4 w-4" />
          <span>Log Out</span>
        </Button>
      </DropdownMenuItem>
      {workspaceId && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Workspace Settings</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link to={`/workspaces/${workspaceId}/settings`}>Users</Link>
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

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
  const [loc, setLoc] = useState(location);

  useEffect(() => {
    if (location.pathname !== loc.pathname) {
      setMobileMenuOpen(false);
      setLoc(location);
    }
  }, [loc, location]);

  return loc.pathname.endsWith("call") ? (
    <div>
      
    </div>
  ) : (
    <header className={`w-full ${className}`}>
      <nav className="relative flex w-full items-center justify-between px-4 py-4 sm:h-[80px] sm:px-8">
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
        <div className="hidden items-center space-x-4 sm:flex">
        
        
          {/* <NavButton to="/">Home</NavButton> */}
{/*           <NavButton to="/services">Services</NavButton>
 */}          {!isSignedIn && (
            <>
              <NavButton to="/signin">Sign In</NavButton>
              <NavButton to="/signup">Sign Up</NavButton>
            </>
          )}
          {workspaces && (
          <NavButton to={"/workspaces"}>Workspaces</NavButton>
        )}
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
          className="text-2xl sm:hidden"
          onClick={() => setMobileMenuOpen(true)}
        >
          <FaBars />
        </button>
      </nav>
      {mobileMenuOpen && (
        <MobileMenu
          isSignedIn={isSignedIn}
          user={user}
          handleSignOut={handleSignOut}
          workspaceId={workspaceId}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
    </header>
  );
}
