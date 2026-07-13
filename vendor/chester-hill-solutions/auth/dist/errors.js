export class AuthzError extends Error {
    code;
    status;
    constructor(message, code, status = 403) {
        super(message);
        this.name = "AuthzError";
        this.code = code;
        this.status = status;
    }
}
export class UnauthorizedError extends AuthzError {
    constructor(message = "Unauthorized") {
        super(message, "UNAUTHORIZED", 401);
        this.name = "UnauthorizedError";
    }
}
export class ForbiddenError extends AuthzError {
    constructor(message = "Forbidden") {
        super(message, "FORBIDDEN", 403);
        this.name = "ForbiddenError";
    }
}
export class InviteError extends AuthzError {
    constructor(message, code, status = 400) {
        super(message, code, status);
        this.name = "InviteError";
    }
}
