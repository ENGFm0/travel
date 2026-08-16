# API Matrix · BoardingPass

Base: `/api/v1` · REST · versioned · Firebase ID-token auth · server-side authorization · unified error contract.
All trip-scoped routes resolve membership+role for `{tripId}` server-side. DTOs whitelist fields.

## Auth & Account
| Method | Path | Story | Auth | Notes |
|---|---|---|---|---|
| POST | /auth/session | US-001 | ID-token | validate token, upsert user, return profile+role |
| POST | /auth/guest | US-001 | anon | scoped guest session |
| POST | /auth/logout | US-001 | user | revoke local/device token |
| GET | /users/me | US-002 | user | own profile+prefs |
| PATCH | /users/me | US-002 | user(self) | name/phone/prefs |
| POST | /users/me/avatar | US-002 | user(self) | signed upload |
| DELETE | /users/me | US-002 | user(self) | soft-delete (blocker: sole owner) |

## Trips & Members
| Method | Path | Story | Auth |
|---|---|---|---|
| POST | /trips | US-003 | user (→owner) |
| GET | /trips?scope=upcoming\|past&page= | US-005 | member-filtered |
| GET | /trips/{tripId} | US-006 | member |
| PATCH | /trips/{tripId}/status | US-005 | owner |
| DELETE | /trips/{tripId} | US-005 | owner (soft) |
| POST | /trips/{tripId}/invitations | US-009 | owner |
| POST | /trips/{tripId}/join | US-009 | user (via link) |
| PATCH | /trips/{tripId}/members/{uid} | US-009 | owner (role/transfer) |
| DELETE | /trips/{tripId}/members/{uid} | US-009 | owner(remove)/self(leave) |
| GET | /trips/{tripId}/members | US-009 | member |

## Itinerary
| Method | Path | Story | Auth |
|---|---|---|---|
| POST/PATCH/DELETE | /trips/{tripId}/cities[/{id}] | US-006 | member |
| POST | /trips/{tripId}/cities/reorder | US-006 | member |
| POST/PATCH/DELETE | /trips/{tripId}/cities/{cid}/days[/{id}] | US-006 | member |
| POST/PATCH/DELETE | /trips/{tripId}/days/{did}/activities[/{id}] | US-006 | member |
| GET | /flights/lookup?code= | US-004 | user (rate-limited, proxy) |

## Expenses
| Method | Path | Story | Auth |
|---|---|---|---|
| GET | /trips/{tripId}/expenses | US-007 | member |
| POST/PATCH/DELETE | /trips/{tripId}/expenses[/{id}] | US-007 | member(own)/owner |
| PUT | /trips/{tripId}/kitty | US-007 | owner |
| POST | /trips/{tripId}/kitty/mark-paid | US-007 | owner |
| POST | /trips/{tripId}/expenses/{id}/settle | US-007 | member/owner |
| GET | /trips/{tripId}/finance/summary | US-007 | member(self-scoped personal) |
| POST | /trips/{tripId}/currency/refresh | US-007 | owner |

## Tasks & Packing
| Method | Path | Story | Auth |
|---|---|---|---|
| GET/POST/PATCH/DELETE | /trips/{tripId}/tasks[/{id}] | US-008 | member |
| GET/POST/PATCH/DELETE | /trips/{tripId}/packing[/{id}] | US-008 | member |
| POST | /trips/{tripId}/packing/template | US-008 | member |

## Memories & Report
| Method | Path | Story | Auth |
|---|---|---|---|
| GET/POST/DELETE | /trips/{tripId}/memories[/{id}] | US-013 | member (POST→signed URL) |
| POST/DELETE | /trips/{tripId}/share | US-013 | owner (link create/revoke) |
| POST | /trips/{tripId}/report | US-013 | member (PDF/link) |

## Social & Community
| Method | Path | Story | Auth |
|---|---|---|---|
| POST/PATCH | /friends/requests[/{id}] | US-010 | user |
| GET/DELETE | /friends[/{uid}] | US-010 | user(self) |
| POST | /friends/invite-to-trip | US-010 | user (trip owner) |
| GET/POST | /buddies | US-011 | browse(user/guest△)/create(user) |
| GET/PATCH/DELETE | /buddies/{id} | US-011 | owner |
| POST | /buddies/{id}/join\|leave | US-011 | user (atomic capacity) |
| POST | /buddies/{id}/flag | US-011 | user |
| GET | /places?category=&q=&page= | US-012 | any |
| GET | /places/{id} | US-012 | any (proxy cache) |
| POST/PATCH/DELETE | /places/{id}/reviews[/{rid}] | US-012 | user(own) |

## Notifications
| Method | Path | Story | Auth |
|---|---|---|---|
| GET/PATCH | /notifications[/{id}] | US-015 | recipient |
| POST | /trips/{tripId}/reminders | US-015 | owner (rate-limited) |
| POST/DELETE | /devices/token | US-015 | user |

## Admin (`/admin`, ADMIN/SUPER_ADMIN)
| Method | Path | Story | Auth |
|---|---|---|---|
| GET | /admin/users?q=&page= | US-016 | admin |
| POST | /admin/users/{uid}/suspend\|reactivate | US-016 | admin |
| GET/POST | /admin/moderation/... | US-016 | admin |
| GET | /admin/audit?filters | US-016 | admin |
| PATCH | /admin/config | US-016 | admin△/super |
| POST | /admin/roles/assign | US-016 | super-admin |

## Conventions
- Errors: `{ code, message, messageEn, traceId, details[] }` (02 §8).
- Pagination: cursor/page + `pageSize`; list caps enforced.
- Idempotency keys on create where retries matter (invites, joins).
- Rate-limited: auth, /flights/lookup, /buddies (create/flag), /reminders, uploads.
- All mutating routes emit audit where the owning story requires it.
