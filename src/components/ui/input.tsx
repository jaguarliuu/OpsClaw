import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        className={cn(
          'flex h-9 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 shadow-none outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50',
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
