import * as React from 'react';

import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 shadow-sm', className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('text-sm font-semibold tracking-tight', className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('text-xs text-neutral-400', className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
