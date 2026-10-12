import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/shared/i18n';
import '@/shared/styles/global.css';
import { App } from './App';

// After a new deploy the old hashed chunks are gone, so a lazy import in an
// already-open tab can 404. Vite fires `vite:preloadError` for that — reload
// once (guarded so we never loop) to pull the fresh index.html + chunks.
const RELOAD_KEY = 'bp.reloadedForChunk';
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return; // already tried once — avoid a loop
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch { /* ignore */ }
  window.location.reload();
});
// A clean load means chunks resolved — clear the guard so a later deploy can
// self-heal too.
window.addEventListener('load', () => { try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ } });

const el = document.getElementById('root');
if (!el) throw new Error('Root element #root not found');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the PWA service worker in production only (offline shell + installable).
// Auto-apply updates: when a newly deployed worker takes control, reload once so
// the user always sees the latest build without a manual hard-refresh.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload when an update replaces an existing controller — not on the
    // very first install (which has no prior controller).
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        reg.update().catch(() => {});
        // Re-check for a new version whenever the app is reopened/refocused.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}
