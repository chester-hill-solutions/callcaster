import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  bgColor?: string;

}

export function Card({ children, className = '', bgColor = 'bg-white dark:bg-zinc-900' }: CardProps) {
  return (
    <div className={`${bgColor} p-8 rounded-lg shadow-md dark:shadow-none dark:border-2 dark:border-white ${className} relative`}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-6 text-3xl font-bold text-center text-brand-primary dark:text-white font-Zilla-Slab">
      {children}
    </h2>
  );
}

export function CardContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {children}
    </div>
  );
}

export function CardActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
      {children}
    </div>
  );
}

export function CardSecondaryActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute top-2 right-2">
      {children}
    </div>
  );
}