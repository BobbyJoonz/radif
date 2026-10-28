/**
 * The one client-side way to call the REST routes in CONTRACTS.md §5.
 *
 * Rules it enforces for every screen:
 *   • `POST`/`PATCH` never claim success on a non-2xx;
 *   • the Persian sentence the server sent is what the user sees;
 *   • a network failure is its own code, so the caller can keep the input and
 *     say «شبکه در دسترس نیست» instead of inventing a server error.
 */
export type ApiError = { code: string; message: string; details?: unknown };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: { code: "network", message: "" } };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const body = payload as { ok?: boolean; data?: T; error?: ApiError } | null;
  if (response.ok && body?.ok) {
    return { ok: true, data: body.data as T };
  }

  return {
    ok: false,
    error: body?.error ?? {
      code: response.status === 401 ? "unauthorized" : "internal",
      message: "",
    },
  };
}

/** Fall back to the dictionary's own sentence when the server sent no text. */
export function messageFor(
  error: ApiError,
  dict: { errors: { network: string; unauthorized: string; forbidden: string; conflict: string; invalid: string; rateLimited: string; generic: string } },
): string {
  if (error.message) return error.message;
  switch (error.code) {
    case "network":
      return dict.errors.network;
    case "unauthorized":
      return dict.errors.unauthorized;
    case "forbidden":
      return dict.errors.forbidden;
    case "conflict":
      return dict.errors.conflict;
    case "invalid":
      return dict.errors.invalid;
    case "rate_limited":
      return dict.errors.rateLimited;
    default:
      return dict.errors.generic;
  }
}
