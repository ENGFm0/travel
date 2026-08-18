import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthModal } from './AuthModal';
import { useAuth } from './authStore';

/** Hosts the auth modal and opens it when arriving with `?auth=1` (from the
 *  profile action on any page), then cleans the query. */
export function AuthController() {
  const [params, setParams] = useSearchParams();
  const { openAuth, isAuthenticated } = useAuth();

  useEffect(() => {
    if (params.get('auth') === '1') {
      if (!isAuthenticated) openAuth();
      const next = new URLSearchParams(params);
      next.delete('auth');
      setParams(next, { replace: true });
    }
  }, [params, isAuthenticated, openAuth, setParams]);

  return <AuthModal />;
}
