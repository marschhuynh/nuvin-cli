export interface ProfileMetadata {
  name: string;
  description?: string;
  created: string;
  lastUsed: string;
}

export interface ProfileRegistry {
  active: string; // Current active profile (default if not set or "default")
  profiles: Record<string, ProfileMetadata>; // Only non-default profiles
}

export interface CreateProfileOptions {
  description?: string;
  cloneFrom?: string;
}

export interface DeleteProfileOptions {
  force?: boolean;
}

export const DEFAULT_PROFILE = 'default';
export const PROFILES_REGISTRY_FILE = 'profiles.yaml';
export const PROFILES_DIR = 'profiles';
