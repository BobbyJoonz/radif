import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * One error shape for every route handler, so the UI can render a Persian
 * sentence and a next step instead of a stack trace.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errors = {
  unauthorized: () => new ApiError(401, "unauthorized", "برای این کار باید وارد شوید."),
  forbidden: (why = "نقش شما اجازهٔ این کار را ندارد.") => new ApiError(403, "forbidden", why),
  notFound: (what = "مورد پیدا نشد.") => new ApiError(404, "not_found", what),
  conflict: (what = "این مورد جای دیگری تغییر کرده است.") => new ApiError(409, "conflict", what),
  rateLimited: () => new ApiError(429, "rate_limited", "درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید."),
  invalid: (message = "ورودی معتبر نیست.", details?: unknown) => new ApiError(422, "invalid", message, details),
  upstream: (message = "سرویس بیرونی پاسخ نداد.") => new ApiError(502, "upstream", message),
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid",
          message: "ورودی معتبر نیست.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  console.error("[api] unhandled", error);
  return NextResponse.json(
    { ok: false, error: { code: "internal", message: "خطای غیرمنتظره. دوباره تلاش کنید." } },
    { status: 500 },
  );
}

/** Small typed wrapper so every handler is `try/catch` free. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      return fail(error);
    }
  };
}
