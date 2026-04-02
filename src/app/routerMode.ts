import type { OpsClawDesktopRuntime } from '@/features/workbench/types';

type ShouldUseHashRouterInput = {
  runtime?: OpsClawDesktopRuntime;
  location: {
    protocol: string;
  };
};

export function shouldUseHashRouter(input: ShouldUseHashRouterInput) {
  return input.runtime?.desktop === true || input.location.protocol === 'file:';
}
