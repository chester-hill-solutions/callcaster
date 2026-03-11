# Error handling guidelines

Use these rules for new code and while touching existing paths:

1. API routes and server actions should log enough context to debug failures, then return or throw an explicit error instead of silently swallowing it.
2. Client hooks should either surface an error to state/UI or intentionally downgrade it to a best-effort log with a short comment explaining why the failure is non-critical.
3. Fire-and-forget async work should be avoided unless the work is truly optional; otherwise `await` it and handle both network failures and non-`ok` responses.
4. Lazy runtime-only imports are allowed when a package touches browser globals during module evaluation; document that reason inline where the import happens.
