export class AdminUnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "AdminUnauthorizedError";
  }
}

export function requireAdmin(request: Request): void {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) return;
  const fromHeader =
    request.headers.get("x-admin-secret") ??
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    "";
  if (fromHeader !== secret) {
    throw new AdminUnauthorizedError();
  }
}

export function adminErrorResponse(err: unknown) {
  if (err instanceof AdminUnauthorizedError) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
