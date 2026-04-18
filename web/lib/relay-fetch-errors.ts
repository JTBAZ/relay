/** Thrown after 401 handling (logout + redirect) so callers can unwind. */
export class RelayUnauthorizedError extends Error {
  public override readonly name = "RelayUnauthorizedError";

  public constructor(message = "Session expired or invalid.") {
    super(message);
  }
}

/** Signed in but not entitled — do not log out. */
export class RelayForbiddenError extends Error {
  public override readonly name = "RelayForbiddenError";

  public constructor(
    message = "You don't have access to this resource.",
    public readonly code?: string
  ) {
    super(message);
  }
}

export class RelayServerError extends Error {
  public override readonly name = "RelayServerError";

  public constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
  }
}
