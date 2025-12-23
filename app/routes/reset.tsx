<<<<<<< HEAD
import {
  Form,
  json,
  redirect,
  useActionData,
  useNavigate,
} from "@remix-run/react";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { verifyAuth } from "@/lib/supabase.server";
import { LoaderFunctionArgs } from "@remix-run/node";
=======
import { redirect } from "@remix-run/node";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

export const loader = async () => redirect("/reset-password");
export const action = async () => redirect("/reset-password");

export default function ResetRedirect() {
  return null;
}
