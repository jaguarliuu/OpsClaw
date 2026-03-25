import type { PropsWithChildren, ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type SectionCardProps = PropsWithChildren<{
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}>;

export function SectionCard({
  title,
  description,
  actions,
  className = '',
  children,
}: SectionCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
