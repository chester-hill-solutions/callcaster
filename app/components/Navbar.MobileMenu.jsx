import { capitalize } from "~/lib/utils";

import { Link, useLocation, useNavigation } from '@remix-run/react';
import { FaTimes } from 'react-icons/fa';
import { NavButton } from './Navbar';
import { useEffect, useState } from "react";

export const MobileMenu = ({ isSignedIn, user, handleSignOut, workspaceId, onClose }) => {
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
      <div className="flex flex-col items-center space-y-4 mt-8">
        <NavButton to="/" onClick={onClose}>Home</NavButton>
        <NavButton to="/services" onClick={onClose}>Services</NavButton>
        {!isSignedIn && (
          <>
            <NavButton to="/signin" onClick={onClose}>Sign In</NavButton>
            <NavButton to="/signup" onClick={onClose}>Sign Up</NavButton>
          </>
        )}
        {user && (
          <>
            <p className="font-Zilla-Slab text-lg">{capitalize(user.first_name)}</p>
            <p className="font-Zilla-Slab text-lg">{user.username}</p>
            <button
              onClick={() => {
                handleSignOut();
                onClose();
              }}
              className="font-Zilla-Slab text-lg"
            >
              Log Out
            </button>
            {workspaceId && (
              <Link 
                to={`/workspaces/${workspaceId}/settings`}
                onClick={onClose}
                className="font-Zilla-Slab text-lg"
              >
                Workspace Settings
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
};