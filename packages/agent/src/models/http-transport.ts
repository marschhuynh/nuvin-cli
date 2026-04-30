export interface FetchJsonOptions {
  url: string;
  body: unknown;
  headers: Record<string, string>;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

function createHeaders(input: Record<string, string>): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(input)) {
    headers.set(name, value);
  }

  return headers;
}

export async function fetchRawResponse(options: FetchJsonOptions): Promise<Response> {
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return fetchImpl(options.url, {
    method: "POST",
    headers: createHeaders(options.headers),
    body: JSON.stringify(options.body),
    signal: options.signal,
  });
}

export async function fetchJsonResponse<T>(options: FetchJsonOptions): Promise<T> {
  const response = await fetchRawResponse(options);

  if (!response.ok) {
    const body = await response.text();
    const message = body.trim() || response.statusText || "Unknown provider error";

    throw new Error(`Provider request failed with status ${response.status}: ${message}`);
  }

  return (await response.json()) as T;
}
