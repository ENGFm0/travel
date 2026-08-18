namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-002-BE-001 user profile &amp; preferences. All routes are strictly self-scoped:
/// the server resolves the caller from the auth token and enforces <c>uid == self</c>
/// — no user may read or edit another's profile. Email is immutable here (identity
/// anchor, BR-002-001); preference changes are the source of truth and sync across
/// devices (BR-002-003). Account deletion is blocked while the caller is the sole
/// <c>TRIP_OWNER</c> of an active trip that still has other members — they must
/// transfer ownership (US-009) or archive first (BR-002-002); an allowed delete
/// soft-deletes <c>users/{uid}</c>, revokes sessions, and queues a purge
/// (BR-002-004). Avatars upload to Storage under the caller's path with type/size
/// validation. This maps the endpoints + contracts; validation, the deletion
/// blocker, and audit live in the Application/Infrastructure layers.
/// </summary>
public static class UsersEndpoints
{
    public static IEndpointRouteBuilder MapUsersEndpoints(this IEndpointRouteBuilder group)
    {
        var me = group.MapGroup("/users/me");

        me.MapGet("", () => Results.Ok(new { }))
            .WithName("GetMe")
            .WithSummary("Get the caller's profile + preferences (self only).");

        // Update profile/preferences. Email + uid are ignored if sent (immutable).
        // TODO(US-002-BE): validate (VR-002-*), audit PROFILE_UPDATE/PREF_UPDATE.
        me.MapPatch("", (ProfilePatchRequest req) => Results.Ok(new { }))
            .WithName("UpdateMe")
            .WithSummary("Update the caller's profile/preferences (self only).");

        // Register an uploaded avatar (Storage under users/{uid}/avatar).
        me.MapPost("/avatar", (AvatarRequest req) => Results.Ok(new { url = req.Url }))
            .WithName("UploadAvatar")
            .WithSummary("Register the caller's uploaded avatar (self only).");

        // Self account deletion. Returns 409 with a transfer/archive reason when the
        // caller is the sole owner of an active trip with members (BR-002-002).
        me.MapDelete("", () => Results.NoContent())
            .WithName("DeleteMe")
            .WithSummary("Delete the caller's account (blocked while sole trip owner).");

        return group;
    }
}

public sealed record NotifPrefsDto(bool Invites, bool FriendRequests, bool PaymentReminders, bool BuddyUpdates);

public sealed record ProfilePatchRequest(
    string? FirstName,
    string? MiddleName,
    string? LastName,
    string? Phone,
    NotifPrefsDto? Notif);

public sealed record AvatarRequest(string Url);
