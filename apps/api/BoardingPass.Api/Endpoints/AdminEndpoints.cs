namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-016-BE-001 admin &amp; moderation console. Every route under
/// <c>/api/v1/admin</c> requires an <c>ADMIN</c> or <c>SUPER_ADMIN</c> policy and
/// returns 403 with the unified error contract to everyone else (AC6). Every admin
/// action is written to an APPEND-ONLY, tamper-evident audit log (actor, target,
/// reason, old→new) that cannot be edited or deleted (BR-016-001, AC4/AC5). Only
/// <c>SUPER_ADMIN</c> may manage roles or other admins (BR-016-002). Admins reach
/// tenant data only through these logged moderation/support flows — never silently
/// (BR-016-003). Suspension revokes the user's tokens and denies login immediately
/// (BR-016-004); a content take-down notifies the owner with the reason via US-015
/// (BR-016-005); destructive actions require a reason (VR-016-001). This maps the
/// endpoints + contracts; the authorization policies, token revocation, audit
/// store, and notifications live in the Application/Infrastructure layers.
/// </summary>
public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder group)
    {
        var admin = group.MapGroup("/admin");
        // .RequireAuthorization("Admin") once the RBAC policy from US-001 is wired.

        admin.MapGet("/overview", () => Results.Ok(new { users = Array.Empty<object>(), flags = Array.Empty<object>(), audit = Array.Empty<object>() }))
            .WithName("AdminOverview")
            .WithSummary("Users + moderation queue + recent audit (admin only).");

        // Users. Suspension revokes tokens immediately; reason required.
        admin.MapPost("/users/{uid}/suspend", (string uid, ReasonBody req) => Results.NoContent())
            .WithName("SuspendUser")
            .WithSummary("Suspend a user (reason required, tokens revoked, audited).");
        admin.MapPost("/users/{uid}/reactivate", (string uid) => Results.NoContent())
            .WithName("ReactivateUser");

        // Moderation queue: approve/remove flagged content; take-down notifies owner.
        admin.MapPatch("/moderation/{id}", (string id, ModerateBody req) => Results.NoContent())
            .WithName("ModerateContent")
            .WithSummary("Approve or remove flagged content (reason required, notifies owner).");

        // Audit log: filtered + paginated, read-only (append-only store; no delete).
        admin.MapGet("/audit", (string? actor, string? action, string? entity, string? from, string? to, string? cursor) =>
            Results.Ok(new { items = Array.Empty<object>(), nextCursor = (string?)null }))
            .WithName("QueryAudit")
            .WithSummary("Query the append-only audit log (admin only, read-only).");

        // Role management: SUPER_ADMIN only.
        admin.MapPatch("/users/{uid}/role", (string uid, RoleBody req) => Results.NoContent())
            .WithName("AssignRole")
            .WithSummary("Assign a global role (SUPER_ADMIN only, audited).");

        return group;
    }
}

public sealed record ReasonBody(string Reason);
public sealed record ModerateBody(string Action, string Reason); // REMOVE | APPROVE
public sealed record RoleBody(string Role); // USER | ADMIN | SUPER_ADMIN
