export { loader } from "./route.loader.server";
export { action } from "./route.action.server";
export { middleware } from "./route.middleware.server";
export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";

import { Outlet, useOutlet } from "react-router";

import { AdminDashboardPage } from "@/components/admin/AdminDashboardPage";

export default function AdminLayout() {
    const outlet = useOutlet();
    const isIndexRoute = outlet == null;

    if (!isIndexRoute) {
        return <Outlet />;
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <AdminDashboardPage />
        </div>
    );
}
