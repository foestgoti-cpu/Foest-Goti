import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  titulo?: ReactNode;
  acciones?: ReactNode;
  pie?: ReactNode;
}

export function Card({ titulo, acciones, pie, className, children, ...rest }: CardProps) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-ink bg-white', className)} {...rest}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink bg-primary-10 px-4 py-3">
          {titulo && <h2 className="text-base font-semibold">{titulo}</h2>}
          {acciones && <div className="flex items-center gap-2">{acciones}</div>}
        </header>
      )}
      <div className="px-4 py-4">{children}</div>
      {pie && <footer className="border-t border-ink px-4 py-3 text-sm">{pie}</footer>}
    </section>
  );
}
