import { capitalize } from "~/lib/utils";

import { Link, NavLink } from '@remix-run/react';
import { FaTimes } from 'react-icons/fa';
import { Button } from "./ui/button";

export const MobileMenu = ({ isSignedIn, user, handleSignOut, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
      <div className="flex justify-between items-center p-4">
        <Link to="/" className="font-Tabac-Slab text-4xl font-black text-brand-primary">
          CC
        </Link>
        <button onClick={onClose} className="text-2xl">
          <FaTimes />
        </button>
      </div>
      <div className="flex flex-col space-y-2 mt-8 px-2">
        {user && (
          <>
            <div>
              <p className="font-Zilla-Slab text-lg">{capitalize(user.first_name)}</p>
              <p className="font-Zilla-Slab text-lg">{user.username}</p>
            </div>
            <Button
              variant={"outline"}
              onClick={() => {
                handleSignOut();
                onClose();
              }}
              className="font-Zilla-Slab text-lg"
            >
              Log Out
            </Button>
            <Button className="font-Zilla-Slab text-lg"><NavLink to="/workspaces" onClick={onClose}>Workspaces</NavLink></Button>
            <Button className="font-Zilla-Slab text-lg"><NavLink to="/accept-invite" onClick={onClose}>          {user.workspace_invite.length} Pending Invitation
              {user.workspace_invite.length !== 1 ? "s" : ""}
            </NavLink></Button>
          </>
        )}
        <Button className="font-Zilla-Slab text-lg"><NavLink to="/" onClick={onClose}>Home</NavLink></Button>
        <Button className="font-Zilla-Slab text-lg"><NavLink to="/pricing" onClick={onClose}>Pricing</NavLink></Button>
        {!isSignedIn && (
          <>
            <Button className="font-Zilla-Slab text-lg"><NavLink to="/signin" onClick={onClose}>Sign In</NavLink></Button>
            <Button className="font-Zilla-Slab text-lg"><NavLink to="/signup" onClick={onClose}>Sign Up</NavLink></Button>
          </>
        )}

      </div>
    </div>
  );
};