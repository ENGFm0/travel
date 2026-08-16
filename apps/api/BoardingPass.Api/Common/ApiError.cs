namespace BoardingPass.Api.Common;

/// <summary>
/// Unified error contract shared with Web + Mobile (architecture §8).
/// Never leaks stack traces, DB details, or secrets.
/// </summary>
public sealed record ApiError(
    string Code,
    string Message,                 // Arabic (default UI language)
    string? MessageEn = null,
    string? TraceId = null,
    IReadOnlyList<ApiErrorDetail>? Details = null);

public sealed record ApiErrorDetail(string Issue, string? Field = null);
