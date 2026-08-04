import { useTheme } from 'next-themes';
import { Toaster as Toaster$1 } from 'sonner';
import { Loader2Icon, OctagonXIcon, TriangleAlertIcon, InfoIcon, CircleCheckIcon } from 'lucide-react';
import { jsx } from 'react/jsx-runtime';

// src/components/ui/sonner.tsx
var Toaster = ({ ...props }) => {
  const { theme = "system" } = useTheme();
  return /* @__PURE__ */ jsx(
    Toaster$1,
    {
      theme,
      className: "toaster group",
      icons: {
        success: /* @__PURE__ */ jsx(CircleCheckIcon, { className: "size-4 text-success" }),
        info: /* @__PURE__ */ jsx(InfoIcon, { className: "size-4 text-info" }),
        warning: /* @__PURE__ */ jsx(TriangleAlertIcon, { className: "size-4 text-warning" }),
        error: /* @__PURE__ */ jsx(OctagonXIcon, { className: "size-4 text-destructive" }),
        loading: /* @__PURE__ */ jsx(Loader2Icon, { className: "size-4 animate-spin text-primary" })
      },
      style: {
        "--normal-bg": "var(--card)",
        "--normal-text": "var(--card-foreground)",
        "--normal-border": "var(--border)",
        "--success-bg": "color-mix(in oklab, var(--success) 14%, var(--card))",
        "--success-text": "var(--success)",
        "--success-border": "color-mix(in oklab, var(--success) 40%, var(--border))",
        "--info-bg": "color-mix(in oklab, var(--brand-secondary) 70%, var(--card))",
        "--info-text": "var(--info)",
        "--info-border": "color-mix(in oklab, var(--info) 40%, var(--border))",
        "--warning-bg": "color-mix(in oklab, var(--warning) 16%, var(--card))",
        "--warning-text": "var(--warning-foreground)",
        "--warning-border": "color-mix(in oklab, var(--warning) 45%, var(--border))",
        "--error-bg": "color-mix(in oklab, var(--destructive) 14%, var(--card))",
        "--error-text": "var(--destructive)",
        "--error-border": "color-mix(in oklab, var(--destructive) 40%, var(--border))",
        "--border-radius": "var(--radius)"
      },
      toastOptions: {
        classNames: {
          toast: "cn-toast font-sans shadow-[0_2px_0_0_var(--border)] [&_[data-title]]:font-heading [&_[data-title]]:font-semibold"
        }
      },
      ...props
    }
  );
};

export { Toaster };
//# sourceMappingURL=chunk-BCGWSUQT.js.map
//# sourceMappingURL=chunk-BCGWSUQT.js.map