import type {
  ModelRequest,
  PreparedRequest,
  ProviderRequestMutator,
  ProviderSessionResolver,
  ResolvedProviderSession,
} from "../shared/types.ts";

export type {
  ProviderCredential,
  ProviderCredentialKind,
  ProviderEndpoints,
  ProviderRequestMutator,
  ProviderSessionResolver,
  ResolvedProviderSession,
} from "../shared/types.ts";

export interface PrepareProviderRequestOptions {
  sessionManager?: ProviderSessionManager;
  requestMutators?: ProviderRequestMutator[];
  signal?: AbortSignal;
}

export class ProviderSessionManager {
  private readonly resolver: ProviderSessionResolver;
  private cached?: Promise<ResolvedProviderSession>;

  constructor(resolver: ProviderSessionResolver) {
    this.resolver = resolver;
  }

  async resolve(signal?: AbortSignal): Promise<ResolvedProviderSession> {
    if (!this.cached) {
      this.cached = this.resolver.resolve(signal);
    }

    return structuredClone(await this.cached);
  }

  invalidate(): void {
    this.cached = undefined;
  }
}

export async function prepareProviderRequest(
  request: ModelRequest,
  options: PrepareProviderRequestOptions = {},
): Promise<PreparedRequest> {
  let preparedRequest: PreparedRequest = {
    request: structuredClone(request),
    session: options.sessionManager
      ? await options.sessionManager.resolve(options.signal)
      : undefined,
  };

  for (const requestMutator of options.requestMutators ?? []) {
    preparedRequest = await requestMutator(preparedRequest);
  }

  return preparedRequest;
}
