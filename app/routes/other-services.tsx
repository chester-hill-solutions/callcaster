import { redirect } from "@remix-run/node";

export const loader = async () => redirect("/services");
export const action = async () => redirect("/services");

export default function OtherServicesRedirect() {
  return null;
}
