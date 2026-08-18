import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { LocaleProvider } from '@/app/providers/LocaleProvider';
import { router } from '@/app/router';
import { initAuth } from '@/features/auth/authStore';
import { initTrips } from '@/features/trips/tripsStore';
import { initMembers } from '@/features/members/membersStore';
import { initItinerary } from '@/features/itinerary/itineraryStore';
import { initExpenses } from '@/features/expenses/expensesStore';
import { initTasks } from '@/features/tasks/tasksStore';
import { initMemories } from '@/features/memories/memoriesStore';
import { initProfile } from '@/features/profile/profileStore';
import { initFriends } from '@/features/friends/friendsStore';
import { initBuddies } from '@/features/buddies/buddiesStore';
import { initPlaces } from '@/features/places/placesStore';
import { initFlights } from '@/features/flights/flightsStore';

export function App() {
  useEffect(() => {
    void initAuth(); // bootstrap auth provider (Firebase when configured, else mock)
    initTrips(); // bootstrap trips service (API when configured, else in-memory mock)
    initMembers(); // bootstrap members service (API when configured, else in-memory mock)
    initItinerary(); // bootstrap itinerary service (API when configured, else in-memory mock)
    initExpenses(); // bootstrap expenses service (API when configured, else in-memory mock)
    initTasks(); // bootstrap tasks service (API when configured, else in-memory mock)
    initMemories(); // bootstrap memories service (API when configured, else in-memory mock)
    initProfile(); // bootstrap profile service (API when configured, else in-memory mock)
    initFriends(); // bootstrap friends service (API when configured, else in-memory mock)
    initBuddies(); // bootstrap buddies service (API when configured, else in-memory mock)
    initPlaces(); // bootstrap places service (API when configured, else in-memory mock)
    initFlights(); // bootstrap flights lookup service (API proxy when configured, else mock)
  }, []);

  return (
    <ThemeProvider>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </ThemeProvider>
  );
}
