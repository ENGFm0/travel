# Firebase Platform Layer — BoardingPass

The **server-side authorization backbone** for the app: Firestore & Storage
security rules, composite indexes, and emulator/hosting config. The web app's
frontend permission checks are **UX only** — these rules (plus the .NET API's
Admin-SDK flows) are where access is actually enforced.

## Files

| File | Purpose |
|------|---------|
| `firestore.rules` | Trip-as-tenant multi-tenant access rules + global roles (US-001..US-016). Deny-by-default; no cross-trip access. |
| `storage.rules` | Membership-/owner-scoped media (memories) + self avatars, with content-type & size validation. |
| `firestore.indexes.json` | Composite indexes for the app's queries (trips-by-member, buddy filters, places, notifications, audit). |
| `firebase.json` | Rules refs, SPA hosting (`apps/web/dist`), and the local emulator suite. |

## Model (from `user-stories/01-roles-and-permissions.dm`)

- **Global role** = custom auth claim `request.auth.token.role` ∈ `USER | ADMIN | SUPER_ADMIN`,
  set by the backend on session creation (US-001).
- **Per-trip role** = `trips/{tripId}/members/{uid}.role` ∈ `OWNER | MEMBER | VIEWER`.
  Every trip-scoped read resolves membership for `tripId` → **no cross-trip leakage**.
- **Deny-by-default**: the trailing `match /{document=**}` denies everything unmatched.
- **High-integrity writes** (capacity races, one-owner transfer, append-only audit,
  aggregate recompute) run in the backend via the **Admin SDK** (bypasses rules) and
  are denied to direct clients here; rules secure realtime **reads** and the narrow
  safe direct writes.

## Local development (emulator)

```bash
cd firebase
firebase emulators:start          # Auth :9099 · Firestore :8080 · Storage :9199 · UI :4000
```

Point the web app at the emulators via the `VITE_FIREBASE_*` env + the Firebase
emulator connect calls in `apps/web` (see `firebaseAuthProvider`).

## Deploy

```bash
cd firebase
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only hosting        # after `npm --workspace apps/web run build`
```

## Testing the rules

Author unit tests with `@firebase/rules-unit-testing` against the Firestore
emulator (asserting allow/deny per role × path from the permission matrix), run in
CI as a separate job.

> **Environment note:** these rules and config are **authored and reviewed here but
> not deployed/emulated in this workspace** (no Firebase CLI / emulator / project
> provisioned). They are the concrete, reviewable enforcement layer that pairs with
> the `apps/api` (.NET) scaffold. Provision a Firebase project + set custom-claim
> roles to activate.
