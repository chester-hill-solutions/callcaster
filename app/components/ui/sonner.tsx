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

// The shared toaster sets these classNames internally (see shad-cc dist
// sonner). Passing our own toastOptions replaces them, so reproduce them here
// and layer the app's spacing defaults on top: consistent vertical padding and
// a gap between the icon/title/description rows for every toast in the app
// (#1668). If shad-cc's default class changes, update this string with it.
const TOAST_CLASS =
  "cn-toast font-sans shadow-[0_2px_0_0_var(--border)] [&_[data-title]]:font-heading [&_[data-title]]:font-semibold gap-2 py-3";

export function Toaster(props: ComponentProps<typeof ThemedToaster>) {
  return (
    <ThemedToaster
      richColors={props.richColors ?? true}
      toastOptions={{
        classNames: { toast: TOAST_CLASS },
      }}
      {...props}
    />
  );
}