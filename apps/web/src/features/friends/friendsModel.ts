// Pure model + helpers for US-010 (friends & groups / social graph).

export interface Friend {
  id: string;
  name: string;
  username: string;
}

export interface FriendRequest {
  id: string;
  name: string;
  username: string;
}

export interface Graph {
  friends: Friend[];
  incoming: FriendRequest[];
}

export type FriendsErrorCode = 'SELF' | 'ALREADY_FRIEND' | 'PENDING' | 'NOT_FOUND' | 'GENERIC';

export class FriendsError extends Error {
  code: FriendsErrorCode;
  constructor(code: FriendsErrorCode) { super(code); this.code = code; }
}

/** Case-insensitive filter over name + username (AC3). */
export function filterFriends(friends: Friend[], query: string): Friend[] {
  const q = query.trim().toLowerCase();
  if (!q) return friends;
  return friends.filter((f) => f.name.toLowerCase().includes(q) || f.username.toLowerCase().includes(q));
}

/** Normalize a handle for uniqueness checks (username or phone). */
export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, '');
}
