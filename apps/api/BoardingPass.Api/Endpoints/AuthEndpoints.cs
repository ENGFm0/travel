namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-001-BE-001 auth surface. Firebase Admin ID-token validation, Firestore
/// user upsert, custom-role claims, rate limiting and audit are implemented in
/// the Application/Infrastructure layers; this maps the endpoints + contract.
/// </summary>
public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder group)
    {
        var auth = group.MapGroup("/auth");

        // Validate the Firebase ID token (Admin SDK), upsert users/{uid}, return
        // profile + authoritative global role. TODO(US-001-BE-001): real validation.
        auth.MapPost("/session", (SessionRequest req) =>
            Results.Ok(new SessionResponse(
                Status: string.IsNullOrWhiteSpace(req.IdToken) ? "unauthenticated" : "authenticated",
                Role: "USER")))
            .WithName("CreateSession")
            .WithSummary("Exchange a Firebase ID token for an app session (profile + role).");

        auth.MapPost("/guest", () =>
            Results.Ok(new SessionResponse("guest", "USER")))
            .WithName("StartGuestSession");

        auth.MapPost("/logout", () => Results.NoContent())
            .WithName("Logout");

        return group;
    }
}

public sealed record SessionRequest(string? IdToken);
public sealed record SessionResponse(string Status, string Role);
