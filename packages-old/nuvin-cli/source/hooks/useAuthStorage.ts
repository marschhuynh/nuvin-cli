export type AuthStorageFunctions = {
  get: <T>(key: string, scope?: 'global' | 'local') => T | undefined;
  set: (key: string, value: unknown, scope?: 'global' | 'local') => Promise<void>;
};

type AuthEntry = {
  type: 'api-key' | 'oauth';
  'api-key'?: string;
  access?: string;
  refresh?: string;
  expires?: number;
};

export function useAuthStorage({ get, set }: AuthStorageFunctions) {
  const saveApiKeyAuth = async (provider: string, token: string) => {
    const providerLower = provider.toLowerCase();
    const existingAuth = (get(`providers.${providerLower}.auth`) as AuthEntry[]) || [];
    const filteredAuth = existingAuth.filter((auth) => auth.type !== 'api-key');

    const newAuthEntry = {
      type: 'api-key',
      'api-key': token,
    };

    const updatedAuth = [...filteredAuth, newAuthEntry];
    await set(`providers.${providerLower}.auth`, updatedAuth, 'global');
    await set(`providers.${providerLower}.current-auth`, 'api-key', 'global');
  };

  const saveOAuthAuth = async (provider: string, access: string, refresh: string, expires?: number) => {
    const providerLower = provider.toLowerCase();
    const existingAuth = (get(`providers.${providerLower}.auth`) as AuthEntry[]) || [];
    const filteredAuth = existingAuth.filter((auth) => auth.type !== 'oauth');

    const newAuthEntry = {
      type: 'oauth',
      access,
      refresh,
      expires,
    };

    const updatedAuth = [...filteredAuth, newAuthEntry];
    await set(`providers.${providerLower}.auth`, updatedAuth, 'global');
    await set(`providers.${providerLower}.current-auth`, 'oauth', 'global');
  };

  return { saveApiKeyAuth, saveOAuthAuth };
}
