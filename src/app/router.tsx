import { lazy, Suspense } from 'react';
import { createBrowserRouter, createHashRouter } from 'react-router-dom';

import { AppLayout } from '@/app/AppLayout';
import { shouldUseHashRouter } from '@/app/routerMode';
import { WorkbenchPage } from '@/routes/WorkbenchPage';

const LazyInspectionsPage = lazy(async () => {
  const module = await import('@/routes/InspectionsPage');
  return { default: module.InspectionsPage };
});

const LazyAuditPage = lazy(async () => {
  const module = await import('@/routes/AuditPage');
  return { default: module.AuditPage };
});

const LazySettingsPage = lazy(async () => import('@/routes/SettingsPage'));

const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <WorkbenchPage />,
      },
      {
        path: 'inspections',
        element: (
          <Suspense fallback={null}>
            <LazyInspectionsPage />
          </Suspense>
        ),
      },
      {
        path: 'audit',
        element: (
          <Suspense fallback={null}>
            <LazyAuditPage />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={null}>
            <LazySettingsPage />
          </Suspense>
        ),
      },
    ],
  },
];

const createRouter = shouldUseHashRouter({
  runtime: window.__OPSCLAW_RUNTIME__,
  location: window.location,
})
  ? createHashRouter
  : createBrowserRouter;

export const router = createRouter(routes);
