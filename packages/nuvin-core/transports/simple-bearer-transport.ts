import type { FetchTransport } from './transport.js';
import { BaseBearerAuthTransport } from './base-bearer-auth-transport.js';

type ProviderConfig = {
	defaultBaseUrl: string;
};

const PROVIDERS: Record<string, ProviderConfig> = {
	deepinfra: {
		defaultBaseUrl: 'https://api.deepinfra.com/v1/openai',
	},
	openrouter: {
		defaultBaseUrl: 'https://openrouter.ai/api/v1',
	},
	zai: {
		defaultBaseUrl: 'https://api.z.ai/api/coding/paas/v4',
	},
};

export class SimpleBearerAuthTransport extends BaseBearerAuthTransport {
	private readonly providerConfig: ProviderConfig;

	constructor(
		inner: FetchTransport,
		provider: string,
		apiKey?: string,
		baseUrl?: string,
	) {
		const config = PROVIDERS[provider.toLowerCase()];
		if (!config) {
			throw new Error(`Unknown provider: ${provider}. Supported providers: ${Object.keys(PROVIDERS).join(', ')}`);
		}

		super(inner, apiKey, baseUrl);
		this.providerConfig = config;
	}

	protected getDefaultBaseUrl(): string {
		return this.providerConfig.defaultBaseUrl;
	}
}

export function createSimpleBearerTransport(
	inner: FetchTransport,
	provider: 'deepinfra' | 'openrouter' | 'zai',
	apiKey?: string,
	baseUrl?: string,
): SimpleBearerAuthTransport {
	return new SimpleBearerAuthTransport(inner, provider, apiKey, baseUrl);
}
