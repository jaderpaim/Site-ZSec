// Shared auth check for /api/public/hooks/* webhook endpoints.
// Requires a HOOK_SECRET env var (server-only). Callers must send the secret
// in either the `x-hook-secret` header or `apikey` / `x-api-key` headers.

export function checkHookSecret(request: Request): Response | null {
  const expected = process.env.HOOK_SECRET;
  if (!expected) {
    return new Response("Server misconfigured: HOOK_SECRET not set", { status: 500 });
  }
  const provided =
    request.headers.get("x-hook-secret") ??
    request.headers.get("apikey") ??
    request.headers.get("x-api-key");
  if (!provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
