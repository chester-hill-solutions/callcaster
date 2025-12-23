<<<<<<< HEAD
import ServiceCard from "@/components/other-services/ServiceCard";
=======
import { redirect } from "@remix-run/node";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

export const loader = async () => redirect("/services");
export const action = async () => redirect("/services");

export default function OtherServicesRedirect() {
  return null;
}
