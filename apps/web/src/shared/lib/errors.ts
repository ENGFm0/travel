/** Unified error contract shared across Backend, Web and Mobile
 *  (architecture §8). Clients map `code` → localized message and never render
 *  server internals. Extractable to a cross-platform package later. */
export interface ApiErrorShape {
  code: string;
  message: string; // Arabic (default)
  messageEn?: string;
  traceId?: string;
  details?: Array<{ field?: string; issue: string }>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly traceId?: string;
  readonly details?: ApiErrorShape['details'];
  readonly messageEn?: string;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = 'ApiError';
    this.code = shape.code;
    this.traceId = shape.traceId;
    this.details = shape.details;
    this.messageEn = shape.messageEn;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Narrow a fetch Response body into an ApiError (best-effort, never throws on
 *  parse). Falls back to a generic contract so the UI always has a code. */
export async function toApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorShape> = {};
  try {
    body = (await res.json()) as Partial<ApiErrorShape>;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError({
    code: body.code ?? `HTTP_${res.status}`,
    message: body.message ?? 'حدث خطأ غير متوقع',
    messageEn: body.messageEn ?? 'An unexpected error occurred',
    traceId: body.traceId,
    details: body.details,
  });
}
