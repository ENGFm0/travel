using System.Text.Json;

namespace BoardingPass.Api.Common;

/// <summary>
/// Centralized exception handling → unified error contract. Business logic lives
/// in Application services (not controllers/middleware); this only maps failures
/// to the contract and logs with a trace id.
/// </summary>
public sealed class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            var traceId = context.TraceIdentifier;
            logger.LogError(ex, "Unhandled exception. TraceId={TraceId}", traceId);

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";

            var error = new ApiError(
                Code: "INTERNAL_ERROR",
                Message: "حدث خطأ غير متوقع",
                MessageEn: "An unexpected error occurred",
                TraceId: traceId);

            await context.Response.WriteAsync(JsonSerializer.Serialize(error, JsonOptions));
        }
    }
}
