import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/authStore';
import { CreateTripWizard } from './CreateTripWizard';
import { useTripsWizard } from './tripsStore';

/** Hosts the create-trip wizard and opens it when arriving with `?new=1`
 *  (from the bottom-nav CTA on any page). Creating a trip requires an account,
 *  so guests/anonymous users are routed to the auth modal instead. The query
 *  param is stripped either way so a refresh doesn't reopen the flow. */
export function TripsController() {
  const [params, setParams] = useSearchParams();
  const { isAuthenticated, openAuth } = useAuth();
  const { openWizard } = useTripsWizard();

  useEffect(() => {
    if (params.get('new') !== '1') return;
    if (isAuthenticated) openWizard();
    else openAuth();
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, isAuthenticated, openWizard, openAuth, setParams]);

  return <CreateTripWizard />;
}
