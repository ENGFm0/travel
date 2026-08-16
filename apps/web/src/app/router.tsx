import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '@/features/shell/Layout';
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
 *  (Code-splitting via React.lazy is added per-route as pages grow.) */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'planner', element: <PlannerPage /> },
      { path: 'explore', element: <ExplorePage /> },
      { path: 'buddies', element: <BuddiesPage /> },
      { path: 'memories', element: <MemoriesPage /> },
      { path: 'mytrips', element: <MyTripsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
