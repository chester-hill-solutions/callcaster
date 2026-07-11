import { adminMiddleware } from "@/lib/admin-middleware.server";

// React Router 8 requires the route `middleware` export to be an array.
export const middleware = [adminMiddleware];
