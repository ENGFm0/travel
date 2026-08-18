// Pure model + helpers for US-015 (notifications & reminders).
// Payloads carry only a type, minimal params, and a deep-link — details are
// fetched authenticated (BR-015-003). No sensitive cross-tenant data (AC6).

export type NotificationType = 'TRIP_INVITE' | 'FRIEND_REQUEST' | 'PAYMENT_REMINDER' | 'BUDDY_JOIN';

export interface AppNotification {
  id: string;
  type: NotificationType;
  read: boolean;
  ts: string; // ISO timestamp
  actor?: string; // display name of the actor (non-sensitive)
  tripId?: string;
}

export function unreadCount(list: AppNotification[]): number {
  return list.filter((n) => !n.read).length;
}

/** Material icon per notification type. */
export function iconFor(type: NotificationType): string {
  switch (type) {
    case 'TRIP_INVITE': return 'luggage';
    case 'FRIEND_REQUEST': return 'person_add';
    case 'PAYMENT_REMINDER': return 'payments';
    case 'BUDDY_JOIN': return 'diversity_3';
  }
}

/** In-app deep-link to the notification's source (FR-015-002). */
export function deepLinkFor(n: AppNotification): string {
  switch (n.type) {
    case 'TRIP_INVITE': return n.tripId ? `/trips/${n.tripId}#members` : '/mytrips';
    case 'PAYMENT_REMINDER': return n.tripId ? `/trips/${n.tripId}#expenses` : '/mytrips';
    case 'FRIEND_REQUEST': return '/mytrips#friends';
    case 'BUDDY_JOIN': return '/buddies';
  }
}
