import { lazy } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Layout } from '@/features/shell/Layout';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { RequireAdmin } from '@/features/admin/RequireAdmin';
import {
  HomePage,
  PlannerPage,
  MemoriesPage,
  MyTripsPage,
  NotFoundPage,
} from '@/pages/pages';
// Route-level feature pages are code-split so they stay out of the initial
// bundle; the Layout's Suspense boundary covers each load.
const TripDetailPage = lazy(() =>
  import('@/features/trips/TripDetailPage').then((m) => ({ default: m.TripDetailPage })),
);
const ProfilePage = lazy(() =>
  import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const BuddiesPage = lazy(() =>
  import('@/features/buddies/BuddiesPage').then((m) => ({ default: m.BuddiesPage })),
);
const ExplorePage = lazy(() =>
  import('@/features/places/ExplorePage').then((m) => ({ default: m.ExplorePage })),
);
const AdminPage = lazy(() =>
  import('@/features/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const PrivacyPage = lazy(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.TermsPage })));
const HelpPage = lazy(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.HelpPage })));

/** Route registry. Section pages are placeholders until their stories land.
 *  Heavy pages (the trip dashboard) are code-split via React.lazy. Exported as
 *  `routes` so tests can mount a memory router. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'planner', element: <PlannerPage /> },
      { path: 'explore', element: <ExplorePage /> },
      { path: 'buddies', element: <BuddiesPage /> },
      { path: 'memories', element: <MemoriesPage /> },
      // Public content pages (no login): linked from the footer.
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'help', element: <HelpPage /> },
      {
        path: 'mytrips',
        element: (
          <RequireAuth>
            <MyTripsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'trips/:id',
        element: (
          <RequireAuth>
            <TripDetailPage />
          </RequireAuth>
        ),
      },
      {
        path: 'profile',
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        ),
      },
      {
        path: 'admin',
        element: (
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

// basename derives from Vite's base (e.g. '/travel/app/' on GitHub Pages) so
// BrowserRouter builds correct links under a subpath; '/' at site root.
export const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL.replace(/\/+$/, '') || '/',
});
