import { SearchError, isAbortError } from "./errors.js";

export async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}`;
  const text = await response.text().catch(() => "");
  if (!text) return fallback;

  try {
    const json = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof json.error === "string") return json.error;
    return json.error?.message ?? json.message ?? text;
  } catch {
    return text;
  }
}

export async function postJson<T>(
  url: string,
  init: {
    headers?: Record<string, string>;
    body: unknown;
    signal?: AbortSignal;
    label: string;
    hintForStatus?: (status: number) => string | undefined;
  },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
      body: JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new SearchError(`Network error calling ${init.label}: ${(err as Error).message}`);
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const hint = init.hintForStatus?.(response.status);
    throw new SearchError(`${init.label} error: ${message}`, response.status, hint);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new SearchError(
      `${init.label} returned non-JSON response (status ${response.status})`,
      response.status,
    );
  }
}

export async function getJson<T>(
  url: string,
  init: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    label: string;
    hintForStatus?: (status: number) => string | undefined;
  },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
      signal: init.signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new SearchError(`Network error calling ${init.label}: ${(err as Error).message}`);
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const hint = init.hintForStatus?.(response.status);
    throw new SearchError(`${init.label} error: ${message}`, response.status, hint);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new SearchError(
      `${init.label} returned non-JSON response (status ${response.status})`,
      response.status,
    );
  }
}
