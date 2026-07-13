export declare class AuthzError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(message: string, code: string, status?: number);
}
export declare class UnauthorizedError extends AuthzError {
    constructor(message?: string);
}
export declare class ForbiddenError extends AuthzError {
    constructor(message?: string);
}
export declare class InviteError extends AuthzError {
    constructor(message: string, code: string, status?: number);
}
