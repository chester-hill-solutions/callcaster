import type { ReactNode } from "react";

interface AuthPageProps {
  children: ReactNode;
}

export function AuthPage({ children }: AuthPageProps) {
  return (
    <main className="relative isolate flex w-full flex-1 flex-col items-center justify-center px-4 py-8 text-foreground sm:px-6 lg:px-8">
      {children}
      <img
        alt=""
        aria-hidden="true"
        src="/Hero-1.png"
        className="absolute inset-0 z-[-1] h-full w-full object-cover opacity-10"
      />
    </main>
  );
}
