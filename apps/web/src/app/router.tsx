import { lazy } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Layout } from '@/features/shell/Layout';
import { RequireAuth } from '@/features/auth/RequireAuth';
import {
  HomePage,
  PlannerPage,
  ExplorePage,
  BuddiesPage,
  MemoriesPage,
  MyTripsPage,
  ProfilePage,
  NotFoundPage,
} from '@/pages/pages';

// The trip dashboard pulls in every feature tab (itinerary/expenses/tasks/
// members/memories) + their stores — code-split it so it stays out of the
// initial bundle. The Layout's Suspense boundary covers the load.
const TripDetailPage = lazy(() =>
  import('@/features/trips/TripDetailPage').then((m) => ({ default: m.TripDetailPage })),
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
