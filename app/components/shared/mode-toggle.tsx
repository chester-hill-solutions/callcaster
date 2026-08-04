import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";

type ThemeMode = "light" | "dark" | "system";

function getNextTheme(theme: ThemeMode): ThemeMode {
  switch (theme) {
    case "system":
      return "light";
    case "light":
      return "dark";
    case "dark":
      return "system";
    default: {
      const exhaustive: never = theme;
      return exhaustive;
    }
  }
}

function getThemeLabel(theme: ThemeMode): string {
  switch (theme) {
    case "system":
      return "Theme mode: auto (system). Click to switch to light mode.";
    case "light":
      return "Theme mode: light. Click to switch to dark mode.";
    case "dark":
      return "Theme mode: dark. Click to switch to auto mode.";
    default: {
      const exhaustive: never = theme;
      return exhaustive;
    }
  }
}

export function ModeToggle() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  /**
   * @effect Flag that we are past hydration so the resolved-theme icon can render.
   * @effect-deps none (mount only)
   * @effect-side-effects none (local setState)
   * @effect-why-not-loader The theme comes from localStorage/`prefers-color-scheme`,
   *   which the server cannot know. Rendering the resolved icon on the first pass
   *   would mismatch the server HTML, so the neutral SunMoon icon renders until
   *   mount. This is client-only state, not request data.
   */
  useEffect(() => {
    setMounted(true);
  }, []);

  const mode: ThemeMode =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system";
  const label = getThemeLabel(mode);
  const Icon =
    mode === "system" ? SunMoon : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setTheme(getNextTheme(mode))}
      aria-label={`Toggle theme. ${label}`}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-transparent bg-white/70 text-brand-primary transition-colors duration-150 ease-in-out hover:border-brand-primary/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:bg-black/70 dark:text-brand-secondary dark:hover:bg-black"
    >
      {mounted ? (
        <Icon
          className="h-[1.2rem] w-[1.2rem]"
          strokeWidth={1.75}
          aria-hidden
        />
      ) : (
        <SunMoon
          className="h-[1.2rem] w-[1.2rem]"
          strokeWidth={1.75}
          aria-hidden
        />
      )}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
