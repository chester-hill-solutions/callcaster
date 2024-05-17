import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { serialize } from 'cookie';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function setWorkspace(workspace) {
  if (workspace && workspace.id) {
    return serialize('current_workspace_id', workspace.id, { path: '/' });
  } else {
    console.error('Invalid workspace object. Ensure it has a workspace_id property.');
    return null;
  }
}
export function getWorkspace(){
  return localStorage.getItem('current_workspace_id');
}