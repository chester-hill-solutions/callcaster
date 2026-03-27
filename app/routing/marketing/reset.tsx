import { redirect } from "@remix-run/node";

export const loader = async () => redirect("/reset-password");
export const action = async () => redirect("/reset-password");

export default function ResetRedirect() {
  return null;
}
