/**
 * Extracts a safe string message from any API error shape.
 * Handles Pydantic v2 (detail: array), Pydantic v1 (detail: string), network errors.
 */
export function extractApiError(err: unknown, fallback = "An error occurred"): string {
  if (!err) return fallback;

  // Plain string
  if (typeof err === "string") return err;

  const anyErr = err as Record<string, unknown>;

  // Axios error with response data
  const data = (anyErr?.response as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  if (data) {
    const detail = data.detail;

    // Pydantic v2: array of {type, loc, msg, input}
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          const d = item as Record<string, unknown>;
          return (d.msg as string) || (d.type as string) || "Validation error";
        })
        .join("; ");
    }

    // Pydantic v1 / FastAPI string detail
    if (typeof detail === "string") return detail;

    // message field fallback
    if (typeof data.message === "string") return data.message;
  }

  // Network / JS error
  if (typeof anyErr.message === "string") return anyErr.message;

  return fallback;
}
