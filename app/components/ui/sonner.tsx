// App adapter for the shared CHS themed toaster. Keeps the semantic
// token-driven sonner styling from shad-cc as the single source of toast
// appearance (light/dark/system via next-themes), so every toast in the app
// renders through one themed surface instead of the raw sonner defaults.
//
// richColors defaults to on: sonner only applies the shared --success-bg /
// --warning-bg / --error-bg CSS variables when it is enabled, so without it
// typed toasts lose their semantic surfaces.
import type { ComponentProps } from "react";
import { Toaster as ThemedToaster } from "@chester-hill-solutions/shad-cc/sonner";

export function Toaster(props: ComponentProps<typeof ThemedToaster>) {
  return <ThemedToaster richColors={props.richColors ?? true} {...props} />;
}