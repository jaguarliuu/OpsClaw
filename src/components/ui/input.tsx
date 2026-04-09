import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        className={cn(
          'flex h-9 w-full rounded-md border border-[var(--app-border-default)] bg-[var(--app-bg-base)] px-3 py-2 text-sm text-[var(--app-text-primary)] shadow-none outline-none transition-colors placeholder:text-[var(--app-text-tertiary)] focus:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        type={type}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
