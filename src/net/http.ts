const USER_AGENT = "mc-launch/0.0";
const DEFAULT_RETRIES = 3;
const RETRY_BASE_MS = 400;

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(`HTTP ${status} ${statusText} for ${url}`);
    this.name = "HttpError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  url: string,
  attempt: () => Promise<T>,
  retries = DEFAULT_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await attempt();
    } catch (err) {
      // 4xx won't fix itself, don't waste retries
      if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
        throw err;
      }
      lastError = err;
      if (i < retries) await sleep(RETRY_BASE_MS * 2 ** i);
    }
  }
  throw new Error(`Request to ${url} failed after ${retries + 1} attempts`, {
    cause: lastError,
  });
}

async function rawGet(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) throw new HttpError(url, res.status, res.statusText);
  return res;
}

export async function getJson<T>(url: string): Promise<T> {
  return withRetry(url, async () => {
    const res = await rawGet(url);
    return (await res.json()) as T;
  });
}

export async function getBuffer(url: string): Promise<Buffer> {
  return withRetry(url, async () => {
    const res = await rawGet(url);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  });
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return withRetry(url, async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      redirect: "follow",
    });
    if (!res.ok) throw new HttpError(url, res.status, res.statusText);
    return (await res.json()) as T;
  });
}
