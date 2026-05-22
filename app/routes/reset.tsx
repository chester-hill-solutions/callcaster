// @ts-nocheck
import { redirect } from "react-router";

export const loader = async () => redirect("/reset-password");
export const action = async () => redirect("/reset-password");

export default function ResetRedirect() {
  return null;
}
