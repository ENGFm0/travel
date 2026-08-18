namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-015-BE-001 notifications &amp; reminders (FCM). Notifications are
/// recipient-scoped: the caller reads only their own <c>notifications/{uid}</c>
/// and only relevant parties are ever targeted — no cross-tenant payload leakage
/// (BR-015-002). Payloads carry minimal, non-sensitive data plus a deep-link;
/// details are fetched authenticated (BR-015-003, AC6). Push delivery honors the
/// user's per-category preferences from US-002 (BR-015-001). Owner-triggered
/// payment reminders are rate-limited per member per trip (BR-015-004) and target
/// only pending members (VR-015-002). Device tokens are registered/refreshed and
/// removed on logout (BR-015-005). This maps the endpoints + contracts; the event
/// handlers, FCM send, preference gating, throttling, and audit live in the
/// Application/Infrastructure layers.
/// </summary>
public static class NotificationsEndpoints
{
    public static IEndpointRouteBuilder MapNotificationsEndpoints(this IEndpointRouteBuilder group)
    {
        var notif = group.MapGroup("/notifications");

        notif.MapGet("", () => Results.Ok(Array.Empty<object>()))
            .WithName("ListNotifications")
            .WithSummary("List the caller's notifications (recipient-scoped).");
        notif.MapPatch("/{id}", (string id, ReadRequest req) => Results.NoContent())
            .WithName("MarkNotificationRead");
        notif.MapPatch("/read-all", () => Results.NoContent())
            .WithName("MarkAllNotificationsRead");

        // Device token lifecycle (register/refresh + remove on logout).
        notif.MapPost("/devices", (DeviceTokenRequest req) => Results.NoContent())
            .WithName("RegisterDeviceToken");
        notif.MapDelete("/devices/{token}", (string token) => Results.NoContent())
            .WithName("RemoveDeviceToken");

        // Owner-triggered payment reminder for a pending member (rate-limited).
        group.MapPost("/trips/{tripId}/reminders", (string tripId, ReminderRequest req) => Results.Accepted())
            .WithName("TriggerPaymentReminder")
            .WithSummary("Remind a pending member to pay the kitty (owner only, rate-limited).");

        return group;
    }
}

public sealed record ReadRequest(bool Read);
public sealed record DeviceTokenRequest(string Token, string Platform); // web | ios | android
public sealed record ReminderRequest(string MemberUid);
