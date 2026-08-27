// App adapter for the shared CHS themed toaster. Keeps the semantic
// token-driven sonner styling from shad-cc as the single source of toast
// appearance (light/dark/system via next-themes), so every toast in the app
// renders through one themed surface instead of the raw sonner defaults.
export { Toaster } from "@chester-hill-solutions/shad-cc/sonner";