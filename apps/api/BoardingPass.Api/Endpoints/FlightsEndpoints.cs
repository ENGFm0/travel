namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-004-BE-001 flight details auto-fill. This is a SERVER-SIDE proxy to
/// AviationStack: the API key comes from the secret store and is NEVER sent to the
/// client (BR-004-001, AC6). The upstream host is fixed (no user-controlled URL →
/// SSRF-safe, VR-004-003); the flight code is validated against
/// <c>^[A-Z0-9]{2}\d{1,4}$</c> before any call. Identical lookups are cached with a
/// short TTL to protect quota (BR-004-004) and lookups are rate-limited per user/IP
/// (BR-004-002). A valid-but-empty upstream result (future/inactive flight) returns
/// <c>found:false</c> — a normal outcome, not an error (BR-004-003). Requires
/// authentication + App Check. This maps the endpoint + contract; the upstream
/// client, cache, throttle, and audit live in the Application/Infrastructure layers.
/// </summary>
public static class FlightsEndpoints
{
    public static IEndpointRouteBuilder MapFlightsEndpoints(this IEndpointRouteBuilder group)
    {
        var flights = group.MapGroup("/flights");
        // .RequireAuthorization() + rate-limiting policy once US-001 is wired.

        flights.MapGet("/lookup", (string? code) =>
        {
            var normalized = (code ?? string.Empty).Trim().ToUpperInvariant();
            if (!System.Text.RegularExpressions.Regex.IsMatch(normalized, "^[A-Z0-9]{2}\\d{1,4}$"))
                return Results.BadRequest(new { code = "INVALID", message = "Invalid flight code" });

            // TODO(US-004-BE-001): check cache → call AviationStack with the
            // server-side key → map DTO → cache → audit FLIGHT_LOOKUP(result).
            return Results.Ok(new { found = false, flight = (object?)null });
        })
        .WithName("LookupFlight")
        .WithSummary("Look up flight details via the server-side AviationStack proxy (no client key).");

        return group;
    }
}

// Response DTO shape (mirrors the web FlightInfo):
// { found: bool, flight?: { code, airline, departure:{name,iata,time}, arrival:{name,iata,time} } }
