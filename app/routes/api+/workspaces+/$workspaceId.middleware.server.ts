import { dataPlaneMiddleware } from "@/lib/data-plane-middleware.server";

// React Router 8 requires the route `middleware` export to be an array.
export const middleware = [dataPlaneMiddleware];
