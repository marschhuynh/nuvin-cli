import type { ChatRequest, ProviderCredential, ResolvedProviderSession } from "../shared/types.ts";

export interface ProviderHeaderContext {
  request?: ChatRequest;
  body?: unknown;
  credential: ProviderCredential;
  session?: ResolvedProviderSession;
  stream: boolean;
}

export interface ProviderAdapter {
  createHeaders(
    context: ProviderHeaderContext,
    options: {
      accept: string;
      includeContentType?: boolean;
    },
  ): Headers | Promise<Headers>;
  createMissingCredentialError(): Error;
  mapApiError(error: Error): Error;
  resolveBaseUrl(defaultBaseUrl: string, session: ResolvedProviderSession | undefined): string;
  resolveCredential(
    apiKey: string | undefined,
    session: ResolvedProviderSession | undefined,
  ): ProviderCredential | undefined;
  toApiError(response: Response): Promise<Error>;
}

export function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveApiCredential(
  apiKey: string | undefined,
  session: ResolvedProviderSession | undefined,
): ProviderCredential | undefined {
  if (session?.credential) {
    return session.credential;
  }

  if (!apiKey) {
    return undefined;
  }

  return {
    kind: "api-key",
    value: apiKey,
  };
}

export function resolveSessionBaseUrl(
  defaultBaseUrl: string,
  session: ResolvedProviderSession | undefined,
): string {
  return trimTrailingSlashes(session?.endpoints?.api ?? defaultBaseUrl);
}
