import { NavLink } from "@remix-run/react";

export function NavButton({
  to,
  children,
  className = "",
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg border px-3 py-2 font-Zilla-Slab text-base font-bold transition-colors duration-150 ease-in-out ${
          isActive
            ? "border-brand-primary bg-brand-primary text-white"
            : "border-transparent bg-background/70 text-brand-primary hover:border-border hover:bg-background"
        } ${className}`
      }
    >
      {children}
    </NavLink>
  );
}
