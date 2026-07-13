/**
 * Runs `fn` inside a postgres.js transaction with a transaction-local `set_config`.
 * Defaults to `app.current_user_id` for SECURITY DEFINER RPCs that read actor context.
 */
export async function withPostgresActorContext(sql, options, fn) {
    const result = await sql.begin(async (tx) => {
        await tx `select set_config(${options.setting}, ${options.value}, true)`;
        return fn(tx);
    });
    return result;
}
/** Convenience wrapper for the common `app.current_user_id` actor setting. */
export async function withAppCurrentUser(sql, userId, fn) {
    return withPostgresActorContext(sql, { setting: "app.current_user_id", value: userId }, fn);
}
