import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-24 w-full rounded-md border border-[var(--app-border-default)] bg-[var(--app-bg-base)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition-colors placeholder:text-[var(--app-text-tertiary)] focus:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
