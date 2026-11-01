/** Public preview mode (temporary): the site runs without Firebase, every
 *  visitor is auto-signed-in as the demo account, and all data is local demo
 *  data kept in the browser. Lets a crawler / audit tool reach every page
 *  without logging in. Switched on by VITE_PUBLIC_PREVIEW="1" at build time
 *  (see .github/workflows/firebase-hosting.yml); set it to "0" to restore the
 *  normal login-required site. */
export const PUBLIC_PREVIEW = import.meta.env.VITE_PUBLIC_PREVIEW === '1';
