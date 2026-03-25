import { createBrowserRouter } from 'react-router-dom';

import { AppLayout } from '@/app/AppLayout';
import { AuditPage } from '@/routes/AuditPage';
import { InspectionsPage } from '@/routes/InspectionsPage';
import SettingsPage from '@/routes/SettingsPage';
import { WorkbenchPage } from '@/routes/WorkbenchPage';

export const router = createBrowserRouter([
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
        element: <InspectionsPage />,
      },
      {
        path: 'audit',
        element: <AuditPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
]);
