import { Outlet, useLocation } from 'react-router-dom';

import { buildWorkbenchShellRouteState } from '@/features/workbench/workbenchShellRouteModel';
import { WorkbenchPage } from '@/routes/WorkbenchPage';

export function WorkbenchShellRoute() {
  const location = useLocation();
  const routeState = buildWorkbenchShellRouteState(location.pathname);

  if (!routeState.keepWorkbenchMounted) {
    return <Outlet />;
  }

  return (
    <div className="relative min-h-screen">
      <WorkbenchPage />
      {routeState.showSettingsOverlay ? (
        <div className="absolute inset-0 z-50 overflow-y-auto">
          <Outlet />
        </div>
      ) : null}
    </div>
  );
}
