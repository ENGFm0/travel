using BoardingPass.Api.Common;
using BoardingPass.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// ── Services ──────────────────────────────────────────────────────────────
builder.Services.AddOpenApi();                 // built-in OpenAPI (.NET 10)
builder.Services.AddHealthChecks();
builder.Services.AddCors(options =>
{
    var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
    options.AddPolicy("bp", policy =>
        policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod());
});

// NOTE: Firebase Admin (token validation), authorization policies (RBAC/PBAC),
// rate limiting, audit, and the Application/Domain/Infrastructure layers are
// introduced by US-001 and the feature stories. This shell provides the
// cross-cutting frame only (US-014-BE-001).

var app = builder.Build();

// ── Pipeline ──────────────────────────────────────────────────────────────
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseCors("bp");

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();                          // /openapi/v1.json
}

// Versioned API surface
var v1 = app.MapGroup("/api/v1");

v1.MapHealthChecks("/health");
v1.MapAuthEndpoints(); // US-001
v1.MapUsersEndpoints(); // US-002
v1.MapTripsEndpoints(); // US-003 / US-005
v1.MapMembersEndpoints(); // US-009
v1.MapItineraryEndpoints(); // US-006
v1.MapExpensesEndpoints(); // US-007
v1.MapTasksEndpoints(); // US-008
v1.MapMemoriesEndpoints(); // US-013
v1.MapFriendsEndpoints(); // US-010
v1.MapBuddiesEndpoints(); // US-011
v1.MapPlacesEndpoints(); // US-012

v1.MapGet("/config", () => Results.Ok(new
{
    app = "BoardingPass",
    version = "v1",
    locales = new[] { "ar", "en" },
    defaultLocale = "ar",
    features = new { flightLookup = true }
}))
.WithName("GetPublicConfig")
.WithSummary("Public runtime config for clients (no secrets).");

app.Run();

// Exposed for integration tests (WebApplicationFactory<Program>)
public partial class Program { }
