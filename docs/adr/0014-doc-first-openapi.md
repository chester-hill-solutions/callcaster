# Doc-first OpenAPI (hand-authored spec)

The OpenAPI spec is hand-authored in code from an `ApiSurfaceEntry` list (`buildOpenApiSpec`), not generated from route annotations or reflection. Hand-written Zod schemas in `app/lib/schemas/api/` complement the generated SDK for rules OpenAPI cannot express (e.g., script XOR). Two specs served: public (`/api/docs/openapi`) and complete (`/api/docs/openapi/all`). Trade-off: maintenance burden (spec can drift from routes if not updated) vs. control (hide internal routes, tag by auth class, document only what's supported, mark unsupported routes with `x-callcaster-supported: false`).

## References

- `app/lib/openapi-build.ts:210` (`buildOpenApiSpec`), `app/lib/schemas/api/` (hand-written Zod), `openapi-ts.config.ts` (Hey API codegen), `docs/api-overview.md`
