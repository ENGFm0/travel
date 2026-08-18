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

/** Route registry. Section pages are placeholders until their stories land.
 *  (Per-route code-splitting via React.lazy is applied per heavy page as they
 *  grow.) Exported as `routes` so tests can mount a memory router. */
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
