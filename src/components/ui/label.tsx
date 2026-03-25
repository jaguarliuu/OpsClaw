import * as React from 'react';

import { cn } from '@/lib/utils';

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-neutral-200', className)} {...props} />;
}

export { Label };
