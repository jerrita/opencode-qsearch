export class SearchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "SearchError";
  }
}

export class AuthError extends SearchError {
  constructor(message: string, hint?: string) {
    super(message, 401, hint);
    this.name = "AuthError";
  }
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}
