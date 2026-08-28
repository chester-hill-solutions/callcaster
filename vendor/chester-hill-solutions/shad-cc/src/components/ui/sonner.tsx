"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-primary" />,
      }}
      style={
        {
        "--normal-bg": "var(--card)",
        "--normal-text": "var(--card-foreground)",
        "--normal-border": "var(--border)",
        // Toast bodies stay foreground-based: tone-colored text on a tone
        // wash fails contrast in dark themes (same rule as the Alert
        // variants — tone signals via wash, border, and the tone icon).
        "--success-bg": "color-mix(in oklab, var(--success) 14%, var(--card))",
        "--success-text": "var(--foreground)",
        "--success-border":
          "color-mix(in oklab, var(--success) 40%, var(--border))",
        "--info-bg": "color-mix(in oklab, var(--brand-secondary) 70%, var(--card))",
        "--info-text": "var(--foreground)",
        "--info-border":
          "color-mix(in oklab, var(--info) 40%, var(--border))",
        "--warning-bg":
          "color-mix(in oklab, var(--warning) 16%, var(--card))",
        "--warning-text": "var(--foreground)",
        "--warning-border":
          "color-mix(in oklab, var(--warning) 45%, var(--border))",
        "--error-bg":
          "color-mix(in oklab, var(--destructive) 14%, var(--card))",
        "--error-text": "var(--foreground)",
        "--error-border":
          "color-mix(in oklab, var(--destructive) 40%, var(--border))",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast font-sans shadow-[0_2px_0_0_var(--border)] [&_[data-title]]:font-heading [&_[data-title]]:font-semibold",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
