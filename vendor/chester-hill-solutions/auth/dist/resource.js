export function resourceUnauthorized(message = "Unauthorized") {
    return new Response(message, { status: 401 });
}
export function resourceForbidden(message = "Forbidden") {
    return new Response(message, { status: 403 });
}
export function resourceNotFound(message = "Not found", headers) {
    return new Response(message, { status: 404, headers });
}
