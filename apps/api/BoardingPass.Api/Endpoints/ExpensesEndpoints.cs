namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-007-BE-001 expenses, kitty &amp; settlement. All amounts, shares, collected
/// totals and net balances are computed SERVER-SIDE and are the source of truth —
/// client sums are never trusted (VR-007-*). Authorization is server-authoritative:
/// only <c>TRIP_OWNER</c> may set the kitty total, confirm payments (mark-paid), or
/// refresh the currency rate (BR-007-001); expense create is any member; edit/delete
/// is creator-or-owner (BR-007-008); personal expenses are strictly self-scoped and
/// never exposed to others (BR-007-003). Deletes recompute dependent totals in a
/// transaction (BR-007-007). Settlement is record-only — no funds move (BR-007-006).
/// This maps the endpoints + contracts; math, persistence, and audit live in the
/// Application/Infrastructure layers.
/// </summary>
public static class ExpensesEndpoints
{
    public static IEndpointRouteBuilder MapExpensesEndpoints(this IEndpointRouteBuilder group)
    {
        var trip = group.MapGroup("/trips/{tripId}");

        // Server-computed finance snapshot (kitty + group + sides + my personal +
        // my net). Personal spend is filtered to the caller.
        trip.MapGet("/finance/summary", (string tripId) =>
            Results.Ok(new { tripId }))
            .WithName("GetFinanceSummary")
            .WithSummary("Server-computed finance snapshot for the caller.");

        // Kitty total (owner only). TODO(US-007-BE): validate >= 0, recompute dues, audit.
        trip.MapPut("/kitty", (string tripId, KittyTotalRequest req) => Results.NoContent())
            .WithName("SetKittyTotal")
            .WithSummary("Set the kitty total (owner only).");

        // Confirm/unconfirm a member's payment (owner only, BR-007-001).
        trip.MapPost("/kitty/mark-paid", (string tripId, MarkPaidRequest req) => Results.NoContent())
            .WithName("MarkKittyPaid")
            .WithSummary("Confirm a member's kitty payment (owner only).");

        // Add an expense (group | side | personal). Any member; server assigns the
        // creator and recomputes totals. TODO(US-007-BE): validate (VR-007-*), audit.
        trip.MapPost("/expenses", (string tripId, ExpenseRequest req) =>
            Results.Created($"/api/v1/trips/{tripId}/expenses", new { }))
            .WithName("AddExpense")
            .WithSummary("Add a group/side/personal expense.");

        trip.MapPatch("/expenses/{eid}", (string tripId, string eid, ExpenseRequest req) => Results.NoContent())
            .WithName("UpdateExpense"); // creator or owner
        trip.MapDelete("/expenses/{eid}", (string tripId, string eid) => Results.NoContent())
            .WithName("DeleteExpense"); // creator or owner; recompute (transaction)
        trip.MapPost("/expenses/{eid}/settle", (string tripId, string eid) => Results.NoContent())
            .WithName("SettleSideKitty"); // record-only (BR-007-006)

        // Personal budget (self-scoped).
        trip.MapPut("/personal/budget", (string tripId, PersonalBudgetRequest req) => Results.NoContent())
            .WithName("SetPersonalBudget");

        // Refresh the trip's stored exchange rate (owner only, US-007-BE-002).
        trip.MapPost("/currency/refresh", (string tripId) =>
            Results.Ok(new { rate = 0.0m }))
            .WithName("RefreshCurrencyRate")
            .WithSummary("Refresh the trip's exchange rate (owner only).");

        return group;
    }
}

public sealed record KittyTotalRequest(decimal Total);
public sealed record MarkPaidRequest(string MemberUid, bool Paid);
public sealed record PersonalBudgetRequest(decimal Amount);

/// <param name="Kind">GROUP | SIDE | PERSONAL</param>
public sealed record ExpenseRequest(
    string Kind,
    string? Desc,
    string? Category,           // HOUSING | FOOD | TRANSPORT | OTHER (group)
    decimal Amount,
    string? PayerUid,           // group/side
    string? Title,              // side
    string[]? ParticipantUids); // side (>= 2)
