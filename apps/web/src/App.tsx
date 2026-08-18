import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { LocaleProvider } from '@/app/providers/LocaleProvider';
import { router } from '@/app/router';
import { initAuth } from '@/features/auth/authStore';
import { initTrips } from '@/features/trips/tripsStore';
import { initMembers } from '@/features/members/membersStore';
import { initItinerary } from '@/features/itinerary/itineraryStore';

export function App() {
  useEffect(() => {
    void initAuth(); // bootstrap auth provider (Firebase when configured, else mock)
    initTrips(); // bootstrap trips service (API when configured, else in-memory mock)
    initMembers(); // bootstrap members service (API when configured, else in-memory mock)
    initItinerary(); // bootstrap itinerary service (API when configured, else in-memory mock)
  }, []);

  return (
    <ThemeProvider>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </ThemeProvider>
  );
}
