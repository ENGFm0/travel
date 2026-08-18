import { lazy } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Layout } from '@/features/shell/Layout';
import { RequireAuth } from '@/features/auth/RequireAuth';
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
