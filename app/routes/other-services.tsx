// @ts-nocheck
import { redirect } from "react-router";

export const loader = async () => redirect("/services");
export const action = async () => redirect("/services");

export default function OtherServicesRedirect() {
  return null;
}
